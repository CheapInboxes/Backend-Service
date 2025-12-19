import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
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
  PricebookItem,
  PricingRule,
} from '../../services/billingService.js';
import type { PricingRuleCondition } from '../../types/index.js';
import { handleError, isNotFoundError } from './helpers.js';

export async function pricebookRoutes(fastify: FastifyInstance) {
  // ==================== Pricebook Items ====================

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
        return handleError(reply, 'PRICEBOOK_FETCH_FAILED', error);
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
        return handleError(reply, 'PRICEBOOK_CREATE_FAILED', error);
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
        return handleError(reply, 'PRICEBOOK_UPDATE_FAILED', error);
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
        return handleError(reply, 'PRICING_RULES_FETCH_FAILED', error);
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
        
        const rule = await createPricingRule(ruleData);
        
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
        return handleError(reply, 'PRICING_RULE_CREATE_FAILED', error);
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
        
        const rule = await updatePricingRule(request.params.id, ruleData);
        
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
        if (isNotFoundError(error)) {
          return handleError(reply, 'PRICING_RULE_NOT_FOUND', error, 404);
        }
        return handleError(reply, 'PRICING_RULE_UPDATE_FAILED', error);
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
        if (isNotFoundError(error)) {
          return handleError(reply, 'PRICING_RULE_NOT_FOUND', error, 404);
        }
        return handleError(reply, 'PRICING_RULE_DELETE_FAILED', error);
      }
    }
  );
}

