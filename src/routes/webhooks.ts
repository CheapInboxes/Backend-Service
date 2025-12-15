import { FastifyInstance } from 'fastify';
import { verifyWebhookSignature } from '../clients/infrastructure/stripe.js';
import { updatePaymentStatus, updateInvoiceStatus } from '../services/billingService.js';
import type Stripe from 'stripe';

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * Stripe webhook handler
   * Handles payment events from Stripe
   */
  fastify.post(
    '/webhooks/stripe',
    {
      config: {
        // Disable body parsing - we need raw body for signature verification
        rawBody: true,
      },
      schema: {
        description: 'Stripe webhook endpoint for handling payment events.',
        tags: ['webhooks'],
        response: {
          200: {
            type: 'object',
            properties: {
              received: { type: 'boolean' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        return reply.code(400).send({ error: 'Missing stripe-signature header' });
      }

      // Get raw body
      const rawBody = (request as any).rawBody || request.body;

      // Verify webhook signature
      const event = verifyWebhookSignature(
        typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
        signature
      );

      if (!event) {
        return reply.code(400).send({ error: 'Invalid webhook signature' });
      }

      console.log(`Stripe webhook received: ${event.type}`);

      try {
        switch (event.type) {
          case 'invoice.paid': {
            const invoice = event.data.object as Stripe.Invoice;
            console.log(`Invoice paid: ${invoice.id}`);
            await updateInvoiceStatus(invoice.id, 'paid');
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice;
            console.log(`Invoice payment failed: ${invoice.id}`);
            // Keep status as 'open' - customer can retry
            break;
          }

          case 'invoice.voided': {
            const invoice = event.data.object as Stripe.Invoice;
            console.log(`Invoice voided: ${invoice.id}`);
            await updateInvoiceStatus(invoice.id, 'void');
            break;
          }

          case 'invoice.marked_uncollectible': {
            const invoice = event.data.object as Stripe.Invoice;
            console.log(`Invoice marked uncollectible: ${invoice.id}`);
            await updateInvoiceStatus(invoice.id, 'uncollectible');
            break;
          }

          case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log(`Payment intent succeeded: ${paymentIntent.id}`);
            await updatePaymentStatus(
              paymentIntent.id,
              'succeeded',
              paymentIntent.latest_charge as string,
              undefined
            );
            break;
          }

          case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log(`Payment intent failed: ${paymentIntent.id}`);
            await updatePaymentStatus(paymentIntent.id, 'failed');
            break;
          }

          case 'charge.succeeded': {
            const charge = event.data.object as Stripe.Charge;
            console.log(`Charge succeeded: ${charge.id}`);
            if (charge.payment_intent) {
              await updatePaymentStatus(
                charge.payment_intent as string,
                'succeeded',
                charge.id,
                charge.receipt_url || undefined
              );
            }
            break;
          }

          case 'charge.refunded': {
            const charge = event.data.object as Stripe.Charge;
            console.log(`Charge refunded: ${charge.id}`);
            if (charge.payment_intent) {
              await updatePaymentStatus(charge.payment_intent as string, 'refunded');
            }
            break;
          }

          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log(`Checkout session completed: ${session.id}`);
            // Payment method was added successfully
            // No action needed - the customer now has a saved payment method
            break;
          }

          case 'customer.subscription.created':
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted': {
            // Handle subscription events if we add subscriptions later
            console.log(`Subscription event: ${event.type}`);
            break;
          }

          default:
            console.log(`Unhandled event type: ${event.type}`);
        }

        return { received: true };
      } catch (error) {
        console.error(`Webhook handler error for ${event.type}:`, error);
        // Still return 200 to acknowledge receipt - we don't want Stripe to retry
        return { received: true };
      }
    }
  );
}


