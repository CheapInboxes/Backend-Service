import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function domainsRoutes(fastify: FastifyInstance) {
  /**
   * List all domains
   */
  fastify.get<{
    Querystring: { org_id?: string; status?: string; provider?: string; limit?: number; offset?: number };
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
            ...paginationQuerySchema,
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

        let query = supabase.from('domains').select('*, organizations(name)');
        let countQuery = supabase.from('domains').select('*', { count: 'exact', head: true });

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
          countQuery = countQuery.eq('status', request.query.status);
        }
        if (request.query.provider) {
          query = query.eq('source_provider', request.query.provider);
          countQuery = countQuery.eq('source_provider', request.query.provider);
        }

        const { count } = await countQuery;

        const { data: domains, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedDomains = (domains || []).map((d: any) => ({
          ...d,
          organization: d.organizations,
          organizations: undefined,
        }));

        return {
          domains: flattenedDomains,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + flattenedDomains.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'DOMAINS_FETCH_FAILED', error);
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
        const { data: domain, error: domainError } = await supabase
          .from('domains')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (domainError || !domain) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
        }

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

        // TODO: Trigger actual provisioning job via queue system

        return { run };
      } catch (error) {
        return handleError(reply, 'RETRY_FAILED', error);
      }
    }
  );
}

