import Stripe from 'stripe';
import { env } from '../../config/env.js';

// Initialize Stripe client with the secret key
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover',
  typescript: true,
});

// Helper functions for common Stripe operations

/**
 * Create a new Stripe customer for an organization
 */
export async function createStripeCustomer(
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    name,
    metadata: metadata || {},
  });
}

/**
 * Get a Stripe customer by ID
 */
export async function getStripeCustomer(customerId: string): Promise<Stripe.Customer | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return null;
    }
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}

/**
 * Update a Stripe customer
 */
export async function updateStripeCustomer(
  customerId: string,
  data: Stripe.CustomerUpdateParams
): Promise<Stripe.Customer> {
  return stripe.customers.update(customerId, data);
}

/**
 * Create a Stripe Checkout session for adding a payment method
 */
export async function createSetupCheckoutSession(
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'setup',
    payment_method_types: ['card'],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

/**
 * Create a Stripe Checkout session for payment
 */
export async function createPaymentCheckoutSession(
  customerId: string,
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: metadata || {},
  });
}

/**
 * List payment methods for a customer
 */
export async function listPaymentMethods(
  customerId: string,
  type: Stripe.PaymentMethodListParams.Type = 'card'
): Promise<Stripe.PaymentMethod[]> {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type,
  });
  return paymentMethods.data;
}

/**
 * Detach a payment method from a customer
 */
export async function detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.detach(paymentMethodId);
}

/**
 * Set a default payment method for a customer
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<Stripe.Customer> {
  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

/**
 * Create a Stripe invoice
 */
export async function createStripeInvoice(
  customerId: string,
  metadata?: Record<string, string>
): Promise<Stripe.Invoice> {
  return stripe.invoices.create({
    customer: customerId,
    auto_advance: false, // Don't auto-finalize - we'll do it manually
    metadata: metadata || {},
  });
}

/**
 * Add line items to a Stripe invoice
 */
export async function addInvoiceLineItem(
  invoiceId: string,
  description: string,
  amount: number, // in cents
  quantity: number = 1
): Promise<Stripe.InvoiceItem> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return stripe.invoiceItems.create({
    customer: invoice.customer as string,
    invoice: invoiceId,
    description,
    amount: amount * quantity,
    currency: 'usd',
  });
}

/**
 * Finalize and send a Stripe invoice
 */
export async function finalizeInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe.invoices.finalizeInvoice(invoiceId);
}

/**
 * Pay a Stripe invoice using the customer's default payment method
 */
export async function payInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe.invoices.pay(invoiceId);
}

/**
 * Get a Stripe invoice
 */
export async function getStripeInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe.invoices.retrieve(invoiceId);
}

/**
 * List invoices for a customer
 */
export async function listStripeInvoices(
  customerId: string,
  limit: number = 100
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });
  return invoices.data;
}

/**
 * Void a Stripe invoice
 */
export async function voidStripeInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe.invoices.voidInvoice(invoiceId);
}

/**
 * Create a payment intent for direct payment
 */
export async function createPaymentIntent(
  amount: number,
  currency: string = 'usd',
  customerId?: string,
  paymentMethodId?: string,
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    metadata: metadata || {},
  };

  if (customerId) {
    params.customer = customerId;
  }

  if (paymentMethodId) {
    params.payment_method = paymentMethodId;
    params.confirm = true;
  }

  return stripe.paymentIntents.create(params);
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not configured - webhook verification skipped');
    return JSON.parse(payload.toString()) as Stripe.Event;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}







