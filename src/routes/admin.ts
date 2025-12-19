import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../middleware/internalAuth.js';
import { supabase } from '../clients/infrastructure/supabase.js';
import {
  getPricebookItems,
  createPricebookItem,
  updatePricebookItem,
  getAllPricingRulesWithConditions,
  createPricingRule,
  createPricingRuleConditions,
  updatePricingRule,
  updatePricingRuleConditions,
  deletePricingRule,
  getAllInvoices,
  generateInvoice,
  syncInvoiceToStripe,
  processInvoicePayment,
  getInvoiceWithItems,
  getPaymentMethods,
  getAllPayments,
  PricebookItem,
  PricingRule,
} from '../services/billingService.js';
import type { PricingRuleCondition } from '../types/index.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // ==================== Pricebook ====================

  /**
   * List all pricebook items
   */
  fastify.get(
    '/admin/pricebook',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:pricebook')],
      schema: {
        description: 'List all pricebook items (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    code: { type: 'string' },
                    name: { type: 'string' },
                    base_unit_price_cents: { type: 'number' },
                    billing_strategy: { type: 'string', enum: ['per_event', 'monthly_recurring', 'annual_recurring', 'one_time'] },
                    billing_period_months: { type: 'number', nullable: true },
                    metadata: { type: 'object' },
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
    async (_request, reply) => {
      try {
        const items = await getPricebookItems();
        return { items };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PRICEBOOK_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Create a pricebook item
   */
  fastify.post<{
    Body: Omit<PricebookItem, 'id'>;
  }>(
    '/admin/pricebook',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:pricebook')],
      schema: {
        description: 'Create a new pricebook item (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['code', 'name', 'base_unit_price_cents', 'billing_strategy'],
          properties: {
            code: { type: 'string', description: 'Unique code for the item' },
            name: { type: 'string', description: 'Display name' },
            base_unit_price_cents: { type: 'number', description: 'Base price in cents' },
            billing_strategy: { type: 'string', enum: ['per_event', 'monthly_recurring', 'annual_recurring', 'one_time'] },
            billing_period_months: { type: 'number', nullable: true },
            metadata: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  name: { type: 'string' },
                  base_unit_price_cents: { type: 'number' },
                  billing_strategy: { type: 'string' },
                  billing_period_months: { type: 'number', nullable: true },
                  metadata: { type: 'object' },
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
        const item = await createPricebookItem(request.body);
        return reply.code(201).send({ item });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PRICEBOOK_CREATE_FAILED', message } });
      }
    }
  );

  /**
   * Update a pricebook item
   */
  fastify.patch<{
    Params: { id: string };
    Body: Partial<Omit<PricebookItem, 'id'>>;
  }>(
    '/admin/pricebook/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:pricebook')],
      schema: {
        description: 'Update a pricebook item (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            name: { type: 'string' },
            base_unit_price_cents: { type: 'number' },
            billing_strategy: { type: 'string', enum: ['per_event', 'monthly_recurring', 'annual_recurring', 'one_time'] },
            billing_period_months: { type: 'number', nullable: true },
            metadata: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  name: { type: 'string' },
                  base_unit_price_cents: { type: 'number' },
                  billing_strategy: { type: 'string' },
                  billing_period_months: { type: 'number', nullable: true },
                  metadata: { type: 'object' },
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
        const item = await updatePricebookItem(request.params.id, request.body);
        return { item };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PRICEBOOK_UPDATE_FAILED', message } });
      }
    }
  );

  // ==================== Pricing Rules ====================

  /**
   * List all pricing rules with conditions
   */
  fastify.get(
    '/admin/pricing-rules',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:pricebook')],
      schema: {
        description: 'List all pricing rules with conditions (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              rules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    active_from: { type: 'string' },
                    active_to: { type: 'string', nullable: true },
                    scope_type: { type: 'string', enum: ['global', 'organization', 'item'] },
                    organization_id: { type: 'string', format: 'uuid', nullable: true },
                    pricebook_item_id: { type: 'string', format: 'uuid', nullable: true },
                    rule_type: { type: 'string', enum: ['percent_discount', 'fixed_discount', 'override_price'] },
                    value: { type: 'number' },
                    priority: { type: 'number' },
                    conditions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          pricing_rule_id: { type: 'string', format: 'uuid' },
                          condition_type: { type: 'string' },
                          operator: { type: 'string' },
                          value: { type: 'object' },
                          group_id: { type: 'number' },
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
    async (_request, reply) => {
      try {
        const rules = await getAllPricingRulesWithConditions();
        return { rules };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PRICING_RULES_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Create a pricing rule with conditions
   */
  fastify.post<{
    Body: Omit<PricingRule, 'id'> & {
      conditions?: Array<{
        condition_type: string;
        operator: string;
        value: Record<string, any>;
        group_id: number;
      }>;
    };
  }>(
    '/admin/pricing-rules',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:pricing_rules')],
      schema: {
        description: 'Create a new pricing rule with conditions (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'active_from', 'scope_type', 'rule_type', 'value'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            active_from: { type: 'string', format: 'date-time' },
            active_to: { type: 'string', format: 'date-time', nullable: true },
            scope_type: { type: 'string', enum: ['global', 'organization', 'item'] },
            organization_id: { type: 'string', format: 'uuid', nullable: true },
            pricebook_item_id: { type: 'string', format: 'uuid', nullable: true },
            rule_type: { type: 'string', enum: ['percent_discount', 'fixed_discount', 'override_price'] },
            value: { type: 'number' },
            priority: { type: 'number' },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['condition_type', 'operator', 'value', 'group_id'],
                properties: {
                  condition_type: { type: 'string', enum: ['organization', 'pricebook_item', 'max_uses', 'min_quantity', 'date_range', 'org_segment'] },
                  operator: { type: 'string', enum: ['in', 'not_in', 'eq', 'neq', 'gte', 'lte', 'between'] },
                  value: { type: 'object' },
                  group_id: { type: 'number' },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              rule: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  active_from: { type: 'string' },
                  active_to: { type: 'string', nullable: true },
                  scope_type: { type: 'string' },
                  organization_id: { type: 'string', nullable: true },
                  pricebook_item_id: { type: 'string', nullable: true },
                  rule_type: { type: 'string' },
                  value: { type: 'number' },
                  priority: { type: 'number' },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        condition_type: { type: 'string' },
                        operator: { type: 'string' },
                        value: { type: 'object' },
                        group_id: { type: 'number' },
                      },
                    },
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
      try {
        const { conditions, ...ruleData } = request.body;
        
        // Create the rule first
        const rule = await createPricingRule(ruleData);
        
        // Create conditions if provided
        let createdConditions: PricingRuleCondition[] = [];
        if (conditions && conditions.length > 0) {
          createdConditions = await createPricingRuleConditions(rule.id, conditions as any);
        }
        
        return reply.code(201).send({ 
          rule: {
            ...rule,
            conditions: createdConditions,
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PRICING_RULE_CREATE_FAILED', message } });
      }
    }
  );

  /**
   * Update a pricing rule with conditions
   */
  fastify.patch<{
    Params: { id: string };
    Body: Partial<Omit<PricingRule, 'id'>> & {
      conditions?: Array<{
        condition_type: string;
        operator: string;
        value: Record<string, any>;
        group_id: number;
      }>;
    };
  }>(
    '/admin/pricing-rules/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:pricing_rules')],
      schema: {
        description: 'Update a pricing rule with conditions (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            active_from: { type: 'string', format: 'date-time' },
            active_to: { type: 'string', format: 'date-time', nullable: true },
            scope_type: { type: 'string', enum: ['global', 'organization', 'item'] },
            organization_id: { type: 'string', format: 'uuid', nullable: true },
            pricebook_item_id: { type: 'string', format: 'uuid', nullable: true },
            rule_type: { type: 'string', enum: ['percent_discount', 'fixed_discount', 'override_price'] },
            value: { type: 'number' },
            priority: { type: 'number' },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['condition_type', 'operator', 'value', 'group_id'],
                properties: {
                  condition_type: { type: 'string', enum: ['organization', 'pricebook_item', 'max_uses', 'min_quantity', 'date_range', 'org_segment'] },
                  operator: { type: 'string', enum: ['in', 'not_in', 'eq', 'neq', 'gte', 'lte', 'between'] },
                  value: { type: 'object' },
                  group_id: { type: 'number' },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              rule: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  active_from: { type: 'string' },
                  active_to: { type: 'string', nullable: true },
                  scope_type: { type: 'string' },
                  organization_id: { type: 'string', nullable: true },
                  pricebook_item_id: { type: 'string', nullable: true },
                  rule_type: { type: 'string' },
                  value: { type: 'number' },
                  priority: { type: 'number' },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        condition_type: { type: 'string' },
                        operator: { type: 'string' },
                        value: { type: 'object' },
                        group_id: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { conditions, ...ruleData } = request.body;
        
        // Update the rule
        const rule = await updatePricingRule(request.params.id, ruleData);
        
        // Update conditions if provided (replaces all existing conditions)
        let updatedConditions: PricingRuleCondition[] = [];
        if (conditions !== undefined) {
          updatedConditions = await updatePricingRuleConditions(request.params.id, conditions as any);
        }
        
        return reply.send({ 
          rule: {
            ...rule,
            conditions: updatedConditions,
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found') || message.includes('Failed to update')) {
          return reply.code(404).send({ error: { code: 'PRICING_RULE_NOT_FOUND', message } });
        }
        return reply.code(400).send({ error: { code: 'PRICING_RULE_UPDATE_FAILED', message } });
      }
    }
  );

  /**
   * Delete a pricing rule
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/admin/pricing-rules/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:pricing_rules')],
      schema: {
        description: 'Delete a pricing rule (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
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
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        await deletePricingRule(request.params.id);
        return reply.send({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found') || message.includes('Failed to delete')) {
          return reply.code(404).send({ error: { code: 'PRICING_RULE_NOT_FOUND', message } });
        }
        return reply.code(400).send({ error: { code: 'PRICING_RULE_DELETE_FAILED', message } });
      }
    }
  );

  // ==================== Invoices ====================

  /**
   * List all invoices (admin view)
   */
  fastify.get<{
    Querystring: { status?: string; org_id?: string };
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
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const invoices = await getAllInvoices({
          status: request.query.status,
          orgId: request.query.org_id,
        });
        return { invoices };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INVOICES_FETCH_FAILED', message } });
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

      // Get organizations to invoice
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PAYMENT_FAILED', message } });
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'SYNC_FAILED', message } });
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found')) {
          return reply.code(404).send({ error: { code: 'INVOICE_NOT_FOUND', message } });
        }
        return reply.code(400).send({ error: { code: 'INVOICE_FETCH_FAILED', message } });
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PAYMENT_METHODS_FETCH_FAILED', message } });
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

        // Get organization and Stripe customer
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

        // Import Stripe client
        const { stripe } = await import('../clients/infrastructure/stripe.js');

        // Create a payment intent
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

        // Attempt to confirm the payment (charge the default payment method)
        const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id);

        // Create payment record
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'CHARGE_FAILED', message } });
      }
    }
  );

  // ==================== Organizations ====================

  /**
   * List all organizations
   */
  fastify.get<{
    Querystring: { status?: string };
  }>(
    '/admin/organizations',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'List all organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organizations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    billing_email: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    domains_count: { type: 'number' },
                    mailboxes_count: { type: 'number' },
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
        let query = supabase.from('organizations').select('*');
        if (request.query.status) {
          query = query.eq('status', request.query.status);
        }
        const { data: orgs, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        // Get counts for each org
        const orgsWithCounts = await Promise.all(
          (orgs || []).map(async (org) => {
            const { count: domainsCount } = await supabase
              .from('domains')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', org.id);

            const { count: mailboxesCount } = await supabase
              .from('mailboxes')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', org.id);

            return {
              ...org,
              domains_count: domainsCount || 0,
              mailboxes_count: mailboxesCount || 0,
            };
          })
        );

        return { organizations: orgsWithCounts };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORGS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Get organization details
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/organizations/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'Get organization details with members (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organization: { type: 'object' },
              members: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    role: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                      },
                    },
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
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        const { data: members, error: membersError } = await supabase
          .from('organization_members')
          .select('*, users(email, name)')
          .eq('organization_id', request.params.id);

        if (membersError) {
          throw new Error(membersError.message);
        }

        return {
          organization: org,
          members: members || [],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORG_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Domains ====================

  /**
   * List all domains
   */
  fastify.get<{
    Querystring: { org_id?: string; status?: string; provider?: string };
  }>(
    '/admin/domains',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:domains')],
      schema: {
        description: 'List all domains across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            org_id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            provider: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              domains: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    domain: { type: 'string' },
                    status: { type: 'string' },
                    source_provider: { type: 'string' },
                    created_at: { type: 'string' },
                    organization: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
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
        let query = supabase.from('domains').select('*, organizations(name)');
        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
        }
        if (request.query.provider) {
          query = query.eq('source_provider', request.query.provider);
        }

        const { data: domains, error } = await query.order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedDomains = (domains || []).map((d: any) => ({
          ...d,
          organization: d.organizations,
          organizations: undefined,
        }));

        return { domains: flattenedDomains };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'DOMAINS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Retry domain provisioning
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/domains/:id/retry',
    {
      preHandler: [internalAuthMiddleware, requirePermission('retry:domains')],
      schema: {
        description: 'Retry domain provisioning (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              run: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  status: { type: 'string' },
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
        // Get domain
        const { data: domain, error: domainError } = await supabase
          .from('domains')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (domainError || !domain) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
        }

        // Create a new run
        const { data: run, error: runError } = await supabase
          .from('domain_runs')
          .insert({
            organization_id: domain.organization_id,
            domain_id: domain.id,
            initiated_by_user_id: request.user?.id || null,
            status: 'queued',
          })
          .select()
          .single();

        if (runError || !run) {
          throw new Error(runError?.message || 'Failed to create run');
        }

        // TODO: Trigger actual provisioning job

        return { run };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'RETRY_FAILED', message } });
      }
    }
  );

  // ==================== Mailboxes ====================

  /**
   * List all mailboxes
   */
  fastify.get<{
    Querystring: { org_id?: string; domain_id?: string; status?: string };
  }>(
    '/admin/mailboxes',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:mailboxes')],
      schema: {
        description: 'List all mailboxes across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            org_id: { type: 'string', format: 'uuid' },
            domain_id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mailboxes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    domain_id: { type: 'string', format: 'uuid' },
                    full_email: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    organization: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                    domain: {
                      type: 'object',
                      properties: {
                        domain: { type: 'string' },
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
        let query = supabase.from('mailboxes').select('*, organizations(name), domains(domain)');
        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
        }
        if (request.query.domain_id) {
          query = query.eq('domain_id', request.query.domain_id);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
        }

        const { data: mailboxes, error } = await query.order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization and domain data
        const flattenedMailboxes = (mailboxes || []).map((m: any) => ({
          ...m,
          organization: m.organizations,
          domain: m.domains,
          organizations: undefined,
          domains: undefined,
        }));

        return { mailboxes: flattenedMailboxes };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'MAILBOXES_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Retry mailbox provisioning
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/mailboxes/:id/retry',
    {
      preHandler: [internalAuthMiddleware, requirePermission('retry:mailboxes')],
      schema: {
        description: 'Retry mailbox provisioning (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              run: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  status: { type: 'string' },
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
        // Get mailbox
        const { data: mailbox, error: mailboxError } = await supabase
          .from('mailboxes')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (mailboxError || !mailbox) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Mailbox not found' } });
        }

        // Create a new run
        const { data: run, error: runError } = await supabase
          .from('mailbox_runs')
          .insert({
            organization_id: mailbox.organization_id,
            domain_id: mailbox.domain_id,
            mailbox_id: mailbox.id,
            initiated_by_user_id: request.user?.id || null,
            status: 'queued',
          })
          .select()
          .single();

        if (runError || !run) {
          throw new Error(runError?.message || 'Failed to create run');
        }

        // TODO: Trigger actual provisioning job

        return { run };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'RETRY_FAILED', message } });
      }
    }
  );

  // ==================== Audit Log ====================

  /**
   * Query audit log
   */
  fastify.get<{
    Querystring: { org_id?: string; user_id?: string; action?: string; start_date?: string; end_date?: string };
  }>(
    '/admin/audit-log',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:audit_log')],
      schema: {
        description: 'Query audit log entries (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            org_id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid', nullable: true },
                    actor_user_id: { type: 'string', format: 'uuid', nullable: true },
                    action: { type: 'string' },
                    target_type: { type: 'string', nullable: true },
                    target_id: { type: 'string', format: 'uuid', nullable: true },
                    metadata: { type: 'object' },
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
      try {
        let query = supabase.from('audit_log').select('*');
        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
        }
        if (request.query.user_id) {
          query = query.eq('actor_user_id', request.query.user_id);
        }
        if (request.query.action) {
          query = query.eq('action', request.query.action);
        }
        if (request.query.start_date) {
          query = query.gte('created_at', request.query.start_date);
        }
        if (request.query.end_date) {
          query = query.lte('created_at', request.query.end_date);
        }

        const { data: entries, error } = await query.order('created_at', { ascending: false }).limit(1000);

        if (error) {
          throw new Error(error.message);
        }

        return { entries: entries || [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'AUDIT_LOG_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Impersonation ====================

  /**
   * Get impersonation token for an organization
   */
  fastify.post<{
    Params: { orgId: string };
  }>(
    '/admin/impersonate/:orgId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('impersonate:organizations')],
      schema: {
        description: 'Get impersonation token to act as an organization (admin only).',
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
              token: { type: 'string', description: 'JWT token to use for impersonation' },
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
        // Verify org exists
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', request.params.orgId)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        // For MVP: Generate a simple token (in production, use proper JWT with org context)
        // This token would be used by the admin frontend to make requests as that org
        const token = btoa(`impersonate:${request.params.orgId}:${Date.now()}`);

        return { token };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'IMPERSONATION_FAILED', message } });
      }
    }
  );

  // ==================== Internal Users Management ====================

  /**
   * List all internal users
   */
  fastify.get(
    '/admin/internal-users',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:internal_users')],
      schema: {
        description: 'List all internal users (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string' },
                    created_at: { type: 'string' },
                    deactivated_at: { type: 'string', nullable: true },
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
    async (_request, reply) => {
      try {
        const { data: users, error } = await supabase
          .from('internal_users')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        return { users: users || [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INTERNAL_USERS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Create internal user
   */
  fastify.post<{
    Body: {
      email: string;
      name?: string;
      role: 'support' | 'ops' | 'billing' | 'admin' | 'founder';
      password: string;
    };
  }>(
    '/admin/internal-users',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:internal_users')],
      schema: {
        description: 'Create a new internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['email', 'role', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['support', 'ops', 'billing', 'admin', 'founder'] },
            password: { type: 'string', minLength: 8 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  role: { type: 'string' },
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
        // Create user in Supabase Auth
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: request.body.email,
          password: request.body.password,
          email_confirm: true,
          user_metadata: {
            name: request.body.name || null,
          },
        });

        if (authError || !authUser.user) {
          throw new Error(authError?.message || 'Failed to create auth user');
        }

        // Create internal user record
        const { data: internalUser, error: internalError } = await supabase
          .from('internal_users')
          .insert({
            user_id: authUser.user.id,
            email: request.body.email,
            name: request.body.name || null,
            role: request.body.role,
          })
          .select()
          .single();

        if (internalError || !internalUser) {
          // Rollback: delete auth user if internal user creation fails
          await supabase.auth.admin.deleteUser(authUser.user.id);
          throw new Error(internalError?.message || 'Failed to create internal user');
        }

        return reply.code(201).send({ user: internalUser });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INTERNAL_USER_CREATE_FAILED', message } });
      }
    }
  );

  /**
   * Update internal user
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      role?: 'support' | 'ops' | 'billing' | 'admin' | 'founder';
      deactivated_at?: string | null;
    };
  }>(
    '/admin/internal-users/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:internal_users')],
      schema: {
        description: 'Update an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['support', 'ops', 'billing', 'admin', 'founder'] },
            deactivated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  deactivated_at: { type: 'string', nullable: true },
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
        const { data: user, error } = await supabase
          .from('internal_users')
          .update(request.body)
          .eq('id', request.params.id)
          .select()
          .single();

        if (error || !user) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Internal user not found' } });
        }

        return { user };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INTERNAL_USER_UPDATE_FAILED', message } });
      }
    }
  );

  /**
   * Grant permission to internal user
   */
  fastify.post<{
    Params: { id: string };
    Body: { permission: string };
  }>(
    '/admin/internal-users/:id/permissions',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:permissions')],
      schema: {
        description: 'Grant a permission to an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['permission'],
          properties: {
            permission: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              permission: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  internal_user_id: { type: 'string', format: 'uuid' },
                  permission: { type: 'string' },
                  granted_at: { type: 'string' },
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
        const { data: perm, error } = await supabase
          .from('internal_user_permissions')
          .insert({
            internal_user_id: request.params.id,
            permission: request.body.permission,
            granted_by: request.internalUser!.id,
          })
          .select()
          .single();

        if (error || !perm) {
          const message = error?.message || 'Unknown error';
          // Check if it's a duplicate
          if (message.includes('duplicate') || message.includes('unique')) {
            return reply.code(400).send({ error: { code: 'PERMISSION_ALREADY_GRANTED', message: 'Permission already granted' } });
          }
          return reply.code(400).send({ error: { code: 'PERMISSION_GRANT_FAILED', message } });
        }

        return reply.code(201).send({ permission: perm });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PERMISSION_GRANT_FAILED', message } });
      }
    }
  );

  /**
   * Revoke permission from internal user
   */
  fastify.delete<{
    Params: { id: string; permission: string };
  }>(
    '/admin/internal-users/:id/permissions/:permission',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:permissions')],
      schema: {
        description: 'Revoke a permission from an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'permission'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            permission: { type: 'string' },
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
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { error } = await supabase
          .from('internal_user_permissions')
          .delete()
          .eq('internal_user_id', request.params.id)
          .eq('permission', request.params.permission);

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PERMISSION_REVOKE_FAILED', message } });
      }
    }
  );

  // ==================== Payments ====================

  /**
   * List all payments (admin view)
   */
  fastify.get<{
    Querystring: { status?: string; org_id?: string };
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
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const payments = await getAllPayments({
          status: request.query.status,
          orgId: request.query.org_id,
        });
        return { payments };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'PAYMENTS_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Session Management ====================

  /**
   * List all active sessions for internal users
   */
  fastify.get(
    '/admin/sessions',
    {
      preHandler: [internalAuthMiddleware, requirePermission('superadmin')],
      schema: {
        description: 'List all active sessions for internal users (superadmin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              sessions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    session_id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string' },
                    user_agent: { type: 'string', nullable: true },
                    ip: { type: 'string', nullable: true },
                    aal: { type: 'string' },
                    created_at: { type: 'string' },
                    refreshed_at: { type: 'string', nullable: true },
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
    async (_request, reply) => {
      try {
        // Query sessions joined with internal_users
        const { data, error } = await supabase.rpc('get_internal_user_sessions');
        
        if (error) {
          // If RPC doesn't exist, fall back to direct query via service role
          // This requires a database function, so let's create one if it doesn't exist
          throw new Error(error.message);
        }

        return { sessions: data || [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'SESSIONS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Terminate a specific session
   */
  fastify.delete<{ Params: { sessionId: string } }>(
    '/admin/sessions/:sessionId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('superadmin')],
      schema: {
        description: 'Terminate a specific session (superadmin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
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
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        // Delete the session from auth.sessions
        const { error } = await supabase.rpc('terminate_session', {
          target_session_id: request.params.sessionId,
        });

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'SESSION_TERMINATE_FAILED', message } });
      }
    }
  );

  // ==================== Integrations ====================

  /**
   * List all integrations across organizations (admin view)
   */
  fastify.get<{
    Querystring: { org_id?: string; type?: string; provider?: string; status?: string };
  }>(
    '/admin/integrations',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:integrations')],
      schema: {
        description: 'List all integrations across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            org_id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            provider: { type: 'string' },
            status: { type: 'string', enum: ['active', 'invalid', 'disabled'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              integrations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    type: { type: 'string' },
                    provider: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    organization: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
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
        let query = supabase
          .from('integrations')
          .select('id, organization_id, type, provider, status, created_at, organizations(name)');

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
        }
        if (request.query.type) {
          query = query.eq('type', request.query.type);
        }
        if (request.query.provider) {
          query = query.eq('provider', request.query.provider);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
        }

        const { data: integrations, error } = await query.order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedIntegrations = (integrations || []).map((i: any) => ({
          ...i,
          organization: i.organizations,
          organizations: undefined,
        }));

        return { integrations: flattenedIntegrations };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'INTEGRATIONS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Test an integration's connection (validate API key)
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/admin/integrations/:id/test',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:integrations')],
      schema: {
        description: 'Test an integration connection by validating its API key (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              status: { type: 'string' },
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
        // Import the sending platform client dynamically
        const { getSendingPlatformClient } = await import('../clients/sending-platforms/index.js');

        // Get integration with credentials
        const { data: integration, error } = await supabase
          .from('integrations')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (error || !integration) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } });
        }

        // Only test sending integrations
        if (integration.type !== 'sending') {
          return { success: true, message: 'Non-sending integrations cannot be tested', status: integration.status };
        }

        const client = getSendingPlatformClient(integration.provider);
        if (!client) {
          return { success: false, message: `Unknown provider: ${integration.provider}`, status: integration.status };
        }

        // Test the connection
        const isValid = await client.validateApiKey(integration.api_key, integration.base_url);

        // Update status if changed
        const newStatus = isValid ? 'active' : 'invalid';
        if (integration.status !== newStatus) {
          await supabase
            .from('integrations')
            .update({ status: newStatus })
            .eq('id', integration.id);
        }

        return {
          success: isValid,
          message: isValid ? 'Connection successful' : 'Connection failed - API key may be invalid',
          status: newStatus,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'TEST_FAILED', message } });
      }
    }
  );

  // ==================== Usage Events ====================

  /**
   * List all usage events across organizations (admin view)
   */
  fastify.get<{
    Querystring: { org_id?: string; code?: string; start_date?: string; end_date?: string };
  }>(
    '/admin/usage-events',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:usage')],
      schema: {
        description: 'List all usage events across organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            org_id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    code: { type: 'string' },
                    quantity: { type: 'number' },
                    effective_at: { type: 'string' },
                    created_at: { type: 'string' },
                    related_ids: { type: 'object' },
                    organization: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
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
        let query = supabase
          .from('usage_events')
          .select('id, organization_id, code, quantity, effective_at, created_at, related_ids, organizations(name)');

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
        }
        if (request.query.code) {
          query = query.eq('code', request.query.code);
        }
        if (request.query.start_date) {
          query = query.gte('effective_at', request.query.start_date);
        }
        if (request.query.end_date) {
          query = query.lte('effective_at', request.query.end_date);
        }

        const { data: events, error } = await query.order('effective_at', { ascending: false }).limit(500);

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedEvents = (events || []).map((e: any) => ({
          ...e,
          organization: e.organizations,
          organizations: undefined,
        }));

        return { events: flattenedEvents };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'USAGE_EVENTS_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Get usage event codes (for dropdown filters)
   */
  fastify.get(
    '/admin/usage-events/codes',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:usage')],
      schema: {
        description: 'Get distinct usage event codes (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              codes: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (_request, reply) => {
      try {
        const { data: items } = await supabase
          .from('pricebook_items')
          .select('code')
          .order('code');

        const codes = (items || []).map((i: { code: string }) => i.code);

        return { codes };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'CODES_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Update organization status (admin)
   */
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'active' | 'trialing' | 'suspended' };
  }>(
    '/admin/organizations/:id/status',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:organizations')],
      schema: {
        description: 'Update organization status (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organization: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  status: { type: 'string' },
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
        const { data: org, error } = await supabase
          .from('organizations')
          .update({ status: request.body.status })
          .eq('id', request.params.id)
          .select('id, status')
          .single();

        if (error || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        return { organization: org };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORG_UPDATE_FAILED', message } });
      }
    }
  );
}

