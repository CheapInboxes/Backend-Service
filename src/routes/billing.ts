import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  getUsageSummary,
  getInvoices,
  getInvoiceWithItems,
  getPayments,
  createCheckoutSession,
  getPaymentMethods,
  removePaymentMethod,
  getMailboxPricingTiers,
} from '../services/billingService.js';
import { getOrders } from '../services/orderService.js';

export async function billingRoutes(fastify: FastifyInstance) {
  // ==================== Public Pricing ====================

  /**
   * Get mailbox pricing tiers (public - no auth required)
   * Used by frontend to display correct prices in cart
   */
  fastify.get(
    '/pricing/mailboxes',
    {
      schema: {
        description: 'Get mailbox pricing tiers including volume discounts. No authentication required.',
        tags: ['pricing'],
        response: {
          200: {
            type: 'object',
            properties: {
              basePriceCents: { type: 'number', description: 'Base price per mailbox in cents' },
              tiers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    minQty: { type: 'number', description: 'Minimum quantity for this tier' },
                    maxQty: { type: ['number', 'null'], description: 'Maximum quantity for this tier (null = unlimited)' },
                    priceCents: { type: 'number', description: 'Price per mailbox in cents' },
                    priceFormatted: { type: 'string', description: 'Formatted price string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        const pricing = await getMailboxPricingTiers();
        return pricing;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(500).send({ error: { code: 'PRICING_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Usage ====================

  /**
   * Get usage summary for current billing period
   */
  fastify.get<{ Params: { orgId: string }; Querystring: { period_start?: string; period_end?: string } }>(
    '/orgs/:orgId/billing/usage',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get usage summary for a billing period. Defaults to current month.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            period_start: { type: 'string', format: 'date', description: 'Start of billing period (YYYY-MM-DD)' },
            period_end: { type: 'string', format: 'date', description: 'End of billing period (YYYY-MM-DD)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              usage: {
                type: 'object',
                properties: {
                  period_start: { type: 'string' },
                  period_end: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        code: { type: 'string' },
                        name: { type: 'string' },
                        quantity: { type: 'number' },
                        base_unit_price_cents: { type: 'number' },
                        final_unit_price_cents: { type: 'number' },
                        discount_percent: { type: 'number', nullable: true },
                        discount_amount_cents: { type: 'number', nullable: true },
                        total_cents: { type: 'number' },
                      },
                    },
                  },
                  total_cents: { type: 'number' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;
      const { period_start, period_end } = request.query;

      // Default to current month
      const now = new Date();
      const periodStart = period_start
        ? new Date(period_start)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = period_end
        ? new Date(period_end)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      try {
        const usage = await getUsageSummary(orgId, periodStart, periodEnd);
        return { usage };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'USAGE_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Orders ====================

  /**
   * List orders for an organization with full line items
   */
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/billing/orders',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List all completed orders for an organization with detailed line items.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              orders: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    invoice_id: { type: 'string', format: 'uuid', nullable: true },
                    payment_id: { type: 'string', format: 'uuid', nullable: true },
                    receipt_url: { type: 'string', nullable: true },
                    line_items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['domain', 'mailbox'] },
                          description: { type: 'string' },
                          domain: { type: 'string', nullable: true },
                          provider: { type: 'string', enum: ['google', 'microsoft'], nullable: true },
                          quantity: { type: 'number' },
                          unit_price_cents: { type: 'number' },
                          total_cents: { type: 'number' },
                        },
                      },
                    },
                    cart_snapshot: {
                      type: 'object',
                      properties: {
                        totals: {
                          type: 'object',
                          properties: {
                            domainTotal: { type: 'number' },
                            mailboxMonthly: { type: 'number' },
                            totalGoogleMailboxes: { type: 'number' },
                            totalMicrosoftMailboxes: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;

      try {
        const orders = await getOrders(orgId);
        return { orders };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORDERS_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Invoices ====================

  /**
   * List invoices for an organization
   */
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/billing/invoices',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List all invoices for an organization.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              invoices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    order_id: { type: 'string', format: 'uuid', nullable: true },
                    period_start: { type: 'string' },
                    period_end: { type: 'string' },
                    total_cents: { type: 'number' },
                    status: { type: 'string', enum: ['draft', 'open', 'paid', 'void', 'uncollectible'] },
                    stripe_invoice_id: { type: 'string', nullable: true },
                    receipt_url: { type: 'string', nullable: true },
                    created_at: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;

      try {
        const invoices = await getInvoices(orgId);
        return { invoices };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INVOICES_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Get invoice details with line items
   */
  fastify.get<{ Params: { orgId: string; invoiceId: string } }>(
    '/orgs/:orgId/billing/invoices/:invoiceId',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get invoice details with line items. For order invoices, also includes order line items.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'invoiceId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            invoiceId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              invoice: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  order_id: { type: 'string', format: 'uuid', nullable: true },
                  period_start: { type: 'string' },
                  period_end: { type: 'string' },
                  total_cents: { type: 'number' },
                  status: { type: 'string' },
                  stripe_invoice_id: { type: 'string', nullable: true },
                  receipt_url: { type: 'string', nullable: true },
                  created_at: { type: 'string' },
                },
              },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    code: { type: 'string' },
                    quantity: { type: 'number' },
                    base_unit_price_cents: { type: 'number' },
                    discount_percent: { type: 'number', nullable: true },
                    discount_amount_cents: { type: 'number', nullable: true },
                    final_unit_price_cents: { type: 'number' },
                    total_cents: { type: 'number' },
                  },
                },
              },
              orderLineItems: {
                type: 'array',
                nullable: true,
                description: 'Line items from order cart (only for order invoices)',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['domain', 'mailbox'] },
                    description: { type: 'string' },
                    domain: { type: 'string', nullable: true },
                    provider: { type: 'string', enum: ['google', 'microsoft'], nullable: true },
                    quantity: { type: 'number' },
                    unit_price_cents: { type: 'number' },
                    total_cents: { type: 'number' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId, invoiceId } = request.params;

      try {
        const result = await getInvoiceWithItems(invoiceId, orgId);
        if (!result) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INVOICE_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Payments ====================

  /**
   * List payments for an organization
   */
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/billing/payments',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List all payments for an organization.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    invoice_id: { type: 'string', format: 'uuid', nullable: true },
                    amount_cents: { type: 'number' },
                    currency: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'succeeded', 'failed', 'refunded', 'canceled'] },
                    receipt_url: { type: 'string', nullable: true },
                    processed_at: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;

      try {
        const payments = await getPayments(orgId);
        return { payments };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PAYMENTS_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Checkout ====================

  /**
   * Create a Stripe Checkout session for adding a payment method
   */
  fastify.post<{ Params: { orgId: string }; Body: { success_url: string; cancel_url: string } }>(
    '/orgs/:orgId/billing/checkout',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Create a Stripe Checkout session to add a payment method.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['success_url', 'cancel_url'],
          properties: {
            success_url: { type: 'string', format: 'uri', description: 'URL to redirect after successful checkout' },
            cancel_url: { type: 'string', format: 'uri', description: 'URL to redirect if checkout is canceled' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              url: { type: 'string' },
            },
          },
          401: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;
      const { success_url, cancel_url } = request.body;

      try {
        const { sessionId, url } = await createCheckoutSession(orgId, success_url, cancel_url);
        return { session_id: sessionId, url };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'CHECKOUT_FAILED', message } });
      }
    }
  );

  // ==================== Payment Methods ====================

  /**
   * List payment methods for an organization
   */
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/billing/payment-methods',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'List saved payment methods for an organization.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              payment_methods: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    card: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        brand: { type: 'string' },
                        last4: { type: 'string' },
                        exp_month: { type: 'number' },
                        exp_year: { type: 'number' },
                      },
                    },
                    created: { type: 'number' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;

      try {
        const methods = await getPaymentMethods(orgId);
        const payment_methods = methods.map((pm) => ({
          id: pm.id,
          type: pm.type,
          card: pm.card
            ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                exp_month: pm.card.exp_month,
                exp_year: pm.card.exp_year,
              }
            : null,
          created: pm.created,
        }));
        return { payment_methods };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PAYMENT_METHODS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Remove a payment method
   */
  fastify.delete<{ Params: { orgId: string; paymentMethodId: string } }>(
    '/orgs/:orgId/billing/payment-methods/:paymentMethodId',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Remove a saved payment method.',
        tags: ['billing'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'paymentMethodId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            paymentMethodId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId, paymentMethodId } = request.params;

      try {
        await removePaymentMethod(orgId, paymentMethodId);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(404).send({ error: { code: 'PAYMENT_METHOD_NOT_FOUND', message } });
      }
    }
  );
}


