import { supabase } from '../clients/infrastructure/supabase.js';
import { stripe } from '../clients/infrastructure/stripe.js';
import { ensureStripeCustomer } from './billingService.js';
import type Stripe from 'stripe';

// Types
export interface CartDomain {
  domain: string;
  available: boolean;
  price: number;
  tld: string;
  mailboxes: {
    provider: 'google' | 'microsoft';
    count: number;
  };
}

export interface CartSnapshot {
  domains: CartDomain[];
  totals: {
    domainTotal: number;
    mailboxMonthly: number;
    totalGoogleMailboxes: number;
    totalMicrosoftMailboxes: number;
  };
}

export interface Order {
  id: string;
  organization_id: string;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  status: 'pending_payment' | 'pending_config' | 'provisioning' | 'completed' | 'canceled';
  cart_snapshot: CartSnapshot;
  created_at: string;
}

export interface Domain {
  id: string;
  organization_id: string;
  order_id: string | null;
  domain: string;
  status: string;
  source_provider: string;
  created_at: string;
}

export interface Mailbox {
  id: string;
  organization_id: string;
  domain_id: string;
  order_id: string | null;
  full_email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  status: string;
  source_provider: string;
  created_at: string;
}

export interface MailboxConfig {
  mailbox_id: string;
  first_name: string;
  last_name: string;
  full_email: string;
  profile_picture_url?: string;
}

// Pricing constants (in cents)
const GOOGLE_MAILBOX_PRICE_CENTS = 350; // $3.50/mo
const MICROSOFT_MAILBOX_PRICE_CENTS = 325; // $3.25/mo

/**
 * Create a Stripe Checkout session for purchasing domains and mailboxes
 * Uses payment mode (one-time) with card saved for future billing via API
 * Returns client_secret for embedded checkout
 */
export async function createCheckoutSession(
  orgId: string,
  cart: CartSnapshot,
  returnUrl: string
): Promise<{ sessionId: string; clientSecret: string; orderId: string }> {
  // Ensure org has Stripe customer
  const customerId = await ensureStripeCustomer(orgId);

  // Create order record first (pending payment)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      organization_id: orgId,
      status: 'pending_payment',
      cart_snapshot: cart,
    })
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create order: ${orderError?.message}`);
  }

  // Build line items - everything is one-time payment
  // Group domains by price to avoid Stripe's 100 line item limit
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  // Group domains by price (in cents) to create aggregate line items
  const domainsByPrice = new Map<number, CartDomain[]>();
  for (const domain of cart.domains) {
    const priceInCents = Math.round(domain.price * 100);
    const existing = domainsByPrice.get(priceInCents) || [];
    existing.push(domain);
    domainsByPrice.set(priceInCents, existing);
  }

  // Add domain line items (grouped by price)
  for (const [priceInCents, domains] of domainsByPrice) {
    const count = domains.length;
    const priceFormatted = (priceInCents / 100).toFixed(2);
    
    // For single domain at a price, show the domain name
    // For multiple domains at same price, show count
    const name = count === 1 
      ? `Domain: ${domains[0].domain}`
      : `Domain Registration (${count} domains)`;
    
    const description = count === 1
      ? `1 year registration for ${domains[0].domain}`
      : `1 year registration @ $${priceFormatted} each: ${domains.map(d => d.domain).slice(0, 10).join(', ')}${count > 10 ? ` and ${count - 10} more` : ''}`;

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name,
          description,
        },
        unit_amount: priceInCents,
      },
      quantity: count,
    });
  }

  // Add mailbox line items (first month payment)
  const totalGoogle = cart.totals.totalGoogleMailboxes;
  const totalMicrosoft = cart.totals.totalMicrosoftMailboxes;

  if (totalGoogle > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Google Workspace Mailbox (First Month)',
          description: `${totalGoogle} mailbox${totalGoogle > 1 ? 'es' : ''} @ $3.50/mo each`,
        },
        unit_amount: GOOGLE_MAILBOX_PRICE_CENTS,
      },
      quantity: totalGoogle,
    });
  }

  if (totalMicrosoft > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Microsoft 365 Mailbox (First Month)',
          description: `${totalMicrosoft} mailbox${totalMicrosoft > 1 ? 'es' : ''} @ $3.25/mo each`,
        },
        unit_amount: MICROSOFT_MAILBOX_PRICE_CENTS,
      },
      quantity: totalMicrosoft,
    });
  }

  // Build return URL with order_id so we can go directly to configure page
  // Replace placeholder if present, otherwise append order_id
  const finalReturnUrl = returnUrl.includes('ORDER_ID_PLACEHOLDER')
    ? returnUrl.replace('ORDER_ID_PLACEHOLDER', order.id)
    : `${returnUrl}?order_id=${order.id}`;

  // Create embedded checkout session with card saved for future use
  // Use ? or & for session_id depending on whether URL already has query params
  const separator = finalReturnUrl.includes('?') ? '&' : '?';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    ui_mode: 'embedded',
    line_items: lineItems,
    return_url: `${finalReturnUrl}${separator}session_id={CHECKOUT_SESSION_ID}`,
    // Save card for future billing
    payment_intent_data: {
      setup_future_usage: 'off_session',
    },
    metadata: {
      order_id: order.id,
      organization_id: orgId,
    },
  });

  // Update order with checkout session ID
  await supabase
    .from('orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);

  return {
    sessionId: session.id,
    clientSecret: session.client_secret || '',
    orderId: order.id,
  };
}

/**
 * Called by webhook when checkout.session.completed fires
 * Creates pending domains and mailboxes from the cart snapshot
 * Also creates invoice and payment records for the order
 */
export async function createOrderFromCheckout(
  checkoutSessionId: string,
  subscriptionId?: string
): Promise<Order> {
  // Find the order by checkout session ID
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('stripe_checkout_session_id', checkoutSessionId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found for checkout session: ${checkoutSessionId}`);
  }

  const cart = order.cart_snapshot as CartSnapshot;

  // Update order with subscription ID if present
  if (subscriptionId) {
    await supabase
      .from('orders')
      .update({ stripe_subscription_id: subscriptionId })
      .eq('id', order.id);
  }

  // Create domains and mailboxes from cart (batch inserts for performance)
  const domainInserts = cart.domains.map(cartDomain => ({
    organization_id: order.organization_id,
    order_id: order.id,
    domain: cartDomain.domain,
    status: 'pending',
    source_provider: 'cheapinboxes',
  }));

  const { data: createdDomains, error: domainsError } = await supabase
    .from('domains')
    .insert(domainInserts)
    .select();

  if (domainsError) {
    console.error('Failed to create domains:', domainsError);
  }

  // Create mailbox records for each domain
  if (createdDomains && createdDomains.length > 0) {
    const mailboxInserts: any[] = [];
    
    for (let i = 0; i < createdDomains.length; i++) {
      const domain = createdDomains[i];
      const cartDomain = cart.domains[i];
      const mailboxCount = cartDomain.mailboxes.count;
      const provider = cartDomain.mailboxes.provider;

      for (let j = 0; j < mailboxCount; j++) {
        mailboxInserts.push({
          organization_id: order.organization_id,
          domain_id: domain.id,
          order_id: order.id,
          full_email: `pending-${j + 1}@${cartDomain.domain}`,
          status: 'pending',
          source_provider: provider,
        });
      }
    }

    if (mailboxInserts.length > 0) {
      const { error: mailboxesError } = await supabase
        .from('mailboxes')
        .insert(mailboxInserts);

      if (mailboxesError) {
        console.error('Failed to create mailboxes:', mailboxesError);
      }
    }
  }

  // Create invoice and payment records for the order
  await createOrderInvoiceAndPayment(order.id, order.organization_id, cart, checkoutSessionId);

  // Update order status to pending_config (ready for wizard)
  const { data: updatedOrder, error: updateError } = await supabase
    .from('orders')
    .update({ status: 'pending_config' })
    .eq('id', order.id)
    .select()
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(`Failed to update order status: ${updateError?.message}`);
  }

  return updatedOrder as Order;
}

/**
 * Create invoice and payment records for a completed order checkout
 */
async function createOrderInvoiceAndPayment(
  orderId: string,
  orgId: string,
  cart: CartSnapshot,
  checkoutSessionId: string
): Promise<void> {
  try {
    // Get the Stripe checkout session to retrieve payment details
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['payment_intent', 'payment_intent.latest_charge'],
    });

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const charge = paymentIntent?.latest_charge as Stripe.Charge | null;

    // Calculate total in cents
    const domainTotalCents = Math.round(cart.totals.domainTotal * 100);
    const mailboxTotalCents = Math.round(cart.totals.mailboxMonthly * 100);
    const totalCents = domainTotalCents + mailboxTotalCents;

    // Create invoice for the order
    const today = new Date();
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        organization_id: orgId,
        order_id: orderId,
        period_start: today.toISOString().split('T')[0],
        period_end: today.toISOString().split('T')[0],
        total_cents: totalCents,
        status: 'paid',
        stripe_invoice_id: null, // Checkout payments don't have a Stripe Invoice
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Failed to create invoice for order:', invoiceError);
      return;
    }

    // Create payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        organization_id: orgId,
        order_id: orderId,
        invoice_id: invoice.id,
        amount_cents: totalCents,
        currency: 'usd',
        status: 'succeeded',
        stripe_payment_intent_id: paymentIntent?.id || null,
        stripe_charge_id: charge?.id || null,
        receipt_url: charge?.receipt_url || null,
        processed_at: new Date().toISOString(),
      });

    if (paymentError) {
      console.error('Failed to create payment record for order:', paymentError);
    }

    console.log(`Created invoice ${invoice.id} and payment for order ${orderId}`);
  } catch (error) {
    console.error('Error creating invoice/payment for order:', error);
  }
}

/**
 * Get an order with its associated domains and mailboxes
 */
export async function getOrderWithItems(
  orderId: string,
  orgId: string
): Promise<{ order: Order; domains: Domain[]; mailboxes: Mailbox[] } | null> {
  // Get order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('organization_id', orgId)
    .single();

  if (orderError || !order) {
    return null;
  }

  // Get domains for this order
  const { data: domains, error: domainsError } = await supabase
    .from('domains')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');

  if (domainsError) {
    throw new Error(`Failed to fetch domains: ${domainsError.message}`);
  }

  // Get mailboxes for this order
  const { data: mailboxes, error: mailboxesError } = await supabase
    .from('mailboxes')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');

  if (mailboxesError) {
    throw new Error(`Failed to fetch mailboxes: ${mailboxesError.message}`);
  }

  return {
    order: order as Order,
    domains: (domains || []) as Domain[],
    mailboxes: (mailboxes || []) as Mailbox[],
  };
}

/**
 * Get the most recent order that needs configuration for an org
 */
export async function getPendingConfigOrder(orgId: string): Promise<Order | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'pending_config')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return null;
  }

  return order as Order;
}

/**
 * Get order by checkout session ID
 */
export async function getOrderByCheckoutSession(sessionId: string): Promise<Order | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !order) {
    return null;
  }

  return order as Order;
}

/**
 * Complete an order by updating mailboxes with final config and triggering provisioning
 */
export async function completeOrder(
  orderId: string,
  orgId: string,
  mailboxConfigs: MailboxConfig[]
): Promise<Order> {
  // Verify order belongs to org and is in correct state
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('organization_id', orgId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found');
  }

  if (order.status !== 'pending_config') {
    throw new Error(`Order is not in pending_config state (current: ${order.status})`);
  }

  // Update each mailbox with its final configuration
  for (const config of mailboxConfigs) {
    const { error: updateError } = await supabase
      .from('mailboxes')
      .update({
        first_name: config.first_name,
        last_name: config.last_name,
        full_email: config.full_email,
        profile_picture_url: config.profile_picture_url || null,
        status: 'provisioning',
      })
      .eq('id', config.mailbox_id)
      .eq('order_id', orderId);

    if (updateError) {
      console.error(`Failed to update mailbox ${config.mailbox_id}:`, updateError);
    }
  }

  // Update domains to provisioning status
  await supabase
    .from('domains')
    .update({ status: 'provisioning' })
    .eq('order_id', orderId);

  // Update order status to provisioning
  const { data: updatedOrder, error: updateError } = await supabase
    .from('orders')
    .update({ status: 'provisioning' })
    .eq('id', orderId)
    .select()
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(`Failed to update order: ${updateError?.message}`);
  }

  // TODO: Queue provisioning jobs for domains and mailboxes
  // This will integrate with the existing automation service

  return updatedOrder as Order;
}

/**
 * Cancel an order (e.g., if payment fails or user abandons)
 */
export async function cancelOrder(orderId: string): Promise<void> {
  // Delete associated mailboxes and domains that were created
  await supabase.from('mailboxes').delete().eq('order_id', orderId);
  await supabase.from('domains').delete().eq('order_id', orderId);

  // Update order status
  await supabase
    .from('orders')
    .update({ status: 'canceled' })
    .eq('id', orderId);
}

/**
 * Order line item for billing display
 */
export interface OrderLineItem {
  type: 'domain' | 'mailbox';
  description: string;
  domain?: string;
  provider?: 'google' | 'microsoft';
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

/**
 * Order with all line items for billing display
 */
export interface OrderWithLineItems extends Order {
  line_items: OrderLineItem[];
  invoice_id?: string;
  payment_id?: string;
  receipt_url?: string;
}

/**
 * Get all orders for an organization with full line items
 */
export async function getOrders(orgId: string): Promise<OrderWithLineItems[]> {
  // Get all non-pending_payment orders
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('organization_id', orgId)
    .neq('status', 'pending_payment')
    .order('created_at', { ascending: false });

  if (ordersError || !orders) {
    return [];
  }

  // Get invoices for these orders
  const orderIds = orders.map(o => o.id);
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .in('order_id', orderIds);

  // Get payments for these orders
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .in('order_id', orderIds);

  // Build order with line items
  return orders.map(order => {
    const cart = order.cart_snapshot as CartSnapshot;
    const lineItems: OrderLineItem[] = [];

    // Add each domain as a line item
    for (const domain of cart.domains) {
      const priceCents = Math.round(domain.price * 100);
      lineItems.push({
        type: 'domain',
        description: `Domain: ${domain.domain}`,
        domain: domain.domain,
        quantity: 1,
        unit_price_cents: priceCents,
        total_cents: priceCents,
      });

      // Add mailboxes for this domain
      if (domain.mailboxes.count > 0) {
        const provider = domain.mailboxes.provider;
        const unitPrice = provider === 'google' ? GOOGLE_MAILBOX_PRICE_CENTS : MICROSOFT_MAILBOX_PRICE_CENTS;
        const providerName = provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
        
        lineItems.push({
          type: 'mailbox',
          description: `${providerName} Mailbox (First Month) - ${domain.domain}`,
          domain: domain.domain,
          provider: provider,
          quantity: domain.mailboxes.count,
          unit_price_cents: unitPrice,
          total_cents: unitPrice * domain.mailboxes.count,
        });
      }
    }

    // Find associated invoice and payment
    const invoice = invoices?.find(i => i.order_id === order.id);
    const payment = payments?.find(p => p.order_id === order.id);

    return {
      ...order,
      cart_snapshot: cart,
      line_items: lineItems,
      invoice_id: invoice?.id,
      payment_id: payment?.id,
      receipt_url: payment?.receipt_url || undefined,
    } as OrderWithLineItems;
  });
}

