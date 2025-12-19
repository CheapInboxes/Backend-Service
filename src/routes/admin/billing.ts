import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { stripe } from '../../clients/infrastructure/stripe.js';
import {
  getAllInvoices,
  generateInvoice,
  syncInvoiceToStripe,
  processInvoicePayment,
  getInvoiceWithItems,
  getPaymentMethods,
  getAllPayments,
} from '../../services/billingService.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function billingRoutes(fastify: FastifyInstance) {
  // ==================== Invoices ====================

  /**
   * List all invoices (admin view)
   */
  fastify.get<{
    Querystring: { status?: string; org_id?: string; limit?: number; offset?: number };
  }>(
    '/admin/invoices',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:invoices')],
      schema: {
        description: 'List all invoices across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'open', 'paid', 'void', 'uncollectible'] },
            org_id: { type: 'string', format: 'uuid' },
            ...paginationQuerySchema,
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
                    period_start: { type: 'string' },
                    period_end: { type: 'string' },
                    total_cents: { type: 'number' },
                    status: { type: 'string' },
                    stripe_invoice_id: { type: 'string', nullable: true },
                    created_at: { type: 'string' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  has_more: { type: 'boolean' },
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
      try {
        const { limit, offset } = parsePagination(request.query);
        const invoices = await getAllInvoices({
          status: request.query.status,
          orgId: request.query.org_id,
          limit,
          offset,
        });

        // Get total count for pagination
        let countQuery = supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true });
        
        if (request.query.status) {
          countQuery = countQuery.eq('status', request.query.status);
        }
        if (request.query.org_id) {
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        
        const { count } = await countQuery;

        return {
          invoices,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + invoices.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'INVOICES_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Generate invoices for a billing period
   */
  fastify.post<{
    Body: {
      org_id?: string;
      period_start: string;
      period_end: string;
      auto_sync?: boolean;
    };
  }>(
    '/admin/billing/generate-invoices',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:invoices')],
      schema: {
        description: 'Generate invoices for organizations (admin only). If org_id is provided, generates for that org only.',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['period_start', 'period_end'],
          properties: {
            org_id: { type: 'string', format: 'uuid', description: 'Optional org ID to generate for specific org' },
            period_start: { type: 'string', format: 'date', description: 'Start of billing period (YYYY-MM-DD)' },
            period_end: { type: 'string', format: 'date', description: 'End of billing period (YYYY-MM-DD)' },
            auto_sync: { type: 'boolean', description: 'Whether to automatically sync to Stripe' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              invoices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    total_cents: { type: 'number' },
                    status: { type: 'string' },
                  },
                },
              },
              errors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    org_id: { type: 'string' },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      const { org_id, period_start, period_end, auto_sync } = request.body;
      const periodStartDate = new Date(period_start);
      const periodEndDate = new Date(period_end);
      periodEndDate.setHours(23, 59, 59, 999);

      const invoices: any[] = [];
      const errors: any[] = [];

      let orgsToInvoice: { id: string }[] = [];

      if (org_id) {
        orgsToInvoice = [{ id: org_id }];
      } else {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id')
          .eq('status', 'active');
        orgsToInvoice = orgs || [];
      }

      for (const org of orgsToInvoice) {
        try {
          const invoice = await generateInvoice(org.id, periodStartDate, periodEndDate);

          if (auto_sync) {
            await syncInvoiceToStripe(invoice.id, true);
          }

          invoices.push({
            id: invoice.id,
            organization_id: invoice.organization_id,
            total_cents: invoice.total_cents,
            status: invoice.status,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ org_id: org.id, error: message });
        }
      }

      return reply.code(201).send({ invoices, errors });
    }
  );

  /**
   * Process payment for an invoice
   */
  fastify.post<{
    Params: { invoiceId: string };
  }>(
    '/admin/invoices/:invoiceId/pay',
    {
      preHandler: [internalAuthMiddleware, requirePermission('process:payments')],
      schema: {
        description: 'Process payment for an invoice (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['invoiceId'],
          properties: {
            invoiceId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              payment: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  amount_cents: { type: 'number' },
                  status: { type: 'string' },
                  receipt_url: { type: 'string', nullable: true },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const payment = await processInvoicePayment(request.params.invoiceId);
        return {
          payment: {
            id: payment.id,
            amount_cents: payment.amount_cents,
            status: payment.status,
            receipt_url: payment.receipt_url,
          },
        };
      } catch (error) {
        return handleError(reply, 'PAYMENT_FAILED', error);
      }
    }
  );

  /**
   * Sync invoice to Stripe
   */
  fastify.post<{
    Params: { invoiceId: string };
    Body: { auto_finalize?: boolean };
  }>(
    '/admin/invoices/:invoiceId/sync',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:invoices')],
      schema: {
        description: 'Sync an invoice to Stripe (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['invoiceId'],
          properties: {
            invoiceId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            auto_finalize: { type: 'boolean' },
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
                  stripe_invoice_id: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const invoice = await syncInvoiceToStripe(
          request.params.invoiceId,
          request.body?.auto_finalize ?? false
        );
        return {
          invoice: {
            id: invoice.id,
            stripe_invoice_id: invoice.stripe_invoice_id,
            status: invoice.status,
          },
        };
      } catch (error) {
        return handleError(reply, 'SYNC_FAILED', error);
      }
    }
  );

  /**
   * Get invoice details with line items (admin)
   */
  fastify.get<{
    Params: { invoiceId: string };
  }>(
    '/admin/invoices/:invoiceId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:invoices')],
      schema: {
        description: 'Get invoice details with line items (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['invoiceId'],
          properties: {
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
                  period_start: { type: 'string' },
                  period_end: { type: 'string' },
                  total_cents: { type: 'number' },
                  status: { type: 'string' },
                  stripe_invoice_id: { type: 'string', nullable: true },
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
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const invoiceData = await getInvoiceWithItems(request.params.invoiceId);
        return invoiceData;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('not found')) {
          return handleError(reply, 'INVOICE_NOT_FOUND', error, 404);
        }
        return handleError(reply, 'INVOICE_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Get payment methods for an organization (admin)
   */
  fastify.get<{
    Params: { orgId: string };
  }>(
    '/admin/organizations/:orgId/payment-methods',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'Get payment methods for an organization (admin only).',
        tags: ['admin'],
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
                      properties: {
                        brand: { type: 'string' },
                        last4: { type: 'string' },
                        exp_month: { type: 'number' },
                        exp_year: { type: 'number' },
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
      try {
        const methods = await getPaymentMethods(request.params.orgId);
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
        }));
        return { payment_methods };
      } catch (error) {
        return handleError(reply, 'PAYMENT_METHODS_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Create a manual charge for an organization (admin)
   */
  fastify.post<{
    Params: { orgId: string };
    Body: {
      amount_cents: number;
      description: string;
      invoice_id?: string;
    };
  }>(
    '/admin/organizations/:orgId/charges',
    {
      preHandler: [internalAuthMiddleware, requirePermission('process:payments')],
      schema: {
        description: 'Create a manual charge for an organization (admin only).',
        tags: ['admin'],
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
          required: ['amount_cents', 'description'],
          properties: {
            amount_cents: { type: 'number', minimum: 1 },
            description: { type: 'string' },
            invoice_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              payment: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  amount_cents: { type: 'number' },
                  status: { type: 'string' },
                  receipt_url: { type: 'string', nullable: true },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { orgId } = request.params;
        const { amount_cents, description, invoice_id } = request.body;

        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('stripe_customer_id')
          .eq('id', orgId)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'ORG_NOT_FOUND', message: 'Organization not found' } });
        }

        if (!org.stripe_customer_id) {
          return reply.code(400).send({
            error: { code: 'NO_STRIPE_CUSTOMER', message: 'Organization does not have a Stripe customer ID' },
          });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount_cents,
          currency: 'usd',
          customer: org.stripe_customer_id,
          description,
          metadata: {
            organization_id: orgId,
            invoice_id: invoice_id || '',
            admin_created: 'true',
          },
        });

        const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id);

        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert({
            organization_id: orgId,
            invoice_id: invoice_id || null,
            amount_cents,
            currency: 'usd',
            status: confirmedPaymentIntent.status === 'succeeded' ? 'succeeded' : 'pending',
            stripe_payment_intent_id: confirmedPaymentIntent.id,
            stripe_charge_id:
              confirmedPaymentIntent.latest_charge && typeof confirmedPaymentIntent.latest_charge === 'string'
                ? confirmedPaymentIntent.latest_charge
                : null,
          })
          .select()
          .single();

        if (paymentError) {
          throw new Error(paymentError.message);
        }

        return reply.code(201).send({
          payment: {
            id: payment.id,
            amount_cents: payment.amount_cents,
            status: payment.status,
            receipt_url: payment.receipt_url,
          },
        });
      } catch (error) {
        return handleError(reply, 'CHARGE_FAILED', error);
      }
    }
  );

  // ==================== Payments ====================

  /**
   * List all payments (admin view)
   */
  fastify.get<{
    Querystring: { status?: string; org_id?: string; limit?: number; offset?: number };
  }>(
    '/admin/payments',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:payments')],
      schema: {
        description: 'List all payments across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'succeeded', 'failed', 'refunded', 'canceled'] },
            org_id: { type: 'string', format: 'uuid' },
            ...paginationQuerySchema,
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
                    status: { type: 'string' },
                    stripe_payment_intent_id: { type: 'string', nullable: true },
                    stripe_charge_id: { type: 'string', nullable: true },
                    receipt_url: { type: 'string', nullable: true },
                    processed_at: { type: 'string' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  has_more: { type: 'boolean' },
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
      try {
        const { limit, offset } = parsePagination(request.query);
        const payments = await getAllPayments({
          status: request.query.status,
          orgId: request.query.org_id,
          limit,
          offset,
        });

        // Get total count for pagination
        let countQuery = supabase
          .from('payments')
          .select('*', { count: 'exact', head: true });
        
        if (request.query.status) {
          countQuery = countQuery.eq('status', request.query.status);
        }
        if (request.query.org_id) {
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        
        const { count } = await countQuery;

        return {
          payments,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + payments.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'PAYMENTS_FETCH_FAILED', error);
      }
    }
  );
}

