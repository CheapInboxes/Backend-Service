import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function auditRoutes(fastify: FastifyInstance) {
  /**
   * Query audit log
   */
  fastify.get<{
    Querystring: { 
      org_id?: string; 
      user_id?: string; 
      action?: string; 
      start_date?: string; 
      end_date?: string;
      limit?: number;
      offset?: number;
    };
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
            ...paginationQuerySchema,
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

        let query = supabase.from('audit_log').select('*');
        let countQuery = supabase.from('audit_log').select('*', { count: 'exact', head: true });

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        if (request.query.user_id) {
          query = query.eq('actor_user_id', request.query.user_id);
          countQuery = countQuery.eq('actor_user_id', request.query.user_id);
        }
        if (request.query.action) {
          query = query.eq('action', request.query.action);
          countQuery = countQuery.eq('action', request.query.action);
        }
        if (request.query.start_date) {
          query = query.gte('created_at', request.query.start_date);
          countQuery = countQuery.gte('created_at', request.query.start_date);
        }
        if (request.query.end_date) {
          query = query.lte('created_at', request.query.end_date);
          countQuery = countQuery.lte('created_at', request.query.end_date);
        }

        const { count } = await countQuery;

        const { data: entries, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        return {
          entries: entries || [],
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + (entries?.length || 0) < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'AUDIT_LOG_FETCH_FAILED', error);
      }
    }
  );
}

