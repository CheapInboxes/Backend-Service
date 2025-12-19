import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function usageRoutes(fastify: FastifyInstance) {
  /**
   * List all usage events across organizations (admin view)
   */
  fastify.get<{
    Querystring: { org_id?: string; code?: string; start_date?: string; end_date?: string; limit?: number; offset?: number };
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
            ...paginationQuerySchema,
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

        let query = supabase
          .from('usage_events')
          .select('id, organization_id, code, quantity, effective_at, created_at, related_ids, organizations(name)');

        let countQuery = supabase
          .from('usage_events')
          .select('*', { count: 'exact', head: true });

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        if (request.query.code) {
          query = query.eq('code', request.query.code);
          countQuery = countQuery.eq('code', request.query.code);
        }
        if (request.query.start_date) {
          query = query.gte('effective_at', request.query.start_date);
          countQuery = countQuery.gte('effective_at', request.query.start_date);
        }
        if (request.query.end_date) {
          query = query.lte('effective_at', request.query.end_date);
          countQuery = countQuery.lte('effective_at', request.query.end_date);
        }

        const { count } = await countQuery;

        const { data: events, error } = await query
          .order('effective_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedEvents = (events || []).map((e: any) => ({
          ...e,
          organization: e.organizations,
          organizations: undefined,
        }));

        return {
          events: flattenedEvents,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + flattenedEvents.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'USAGE_EVENTS_FETCH_FAILED', error);
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
        return handleError(reply, 'CODES_FETCH_FAILED', error);
      }
    }
  );
}

