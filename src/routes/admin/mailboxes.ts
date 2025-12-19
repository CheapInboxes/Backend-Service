import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function mailboxesRoutes(fastify: FastifyInstance) {
  /**
   * List all mailboxes
   */
  fastify.get<{
    Querystring: { org_id?: string; domain_id?: string; status?: string; limit?: number; offset?: number };
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
            ...paginationQuerySchema,
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

        let query = supabase.from('mailboxes').select('*, organizations(name), domains(domain)');
        let countQuery = supabase.from('mailboxes').select('*', { count: 'exact', head: true });

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        if (request.query.domain_id) {
          query = query.eq('domain_id', request.query.domain_id);
          countQuery = countQuery.eq('domain_id', request.query.domain_id);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
          countQuery = countQuery.eq('status', request.query.status);
        }

        const { count } = await countQuery;

        const { data: mailboxes, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

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

        return {
          mailboxes: flattenedMailboxes,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + flattenedMailboxes.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'MAILBOXES_FETCH_FAILED', error);
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
        const { data: mailbox, error: mailboxError } = await supabase
          .from('mailboxes')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (mailboxError || !mailbox) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Mailbox not found' } });
        }

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

        // TODO: Trigger actual provisioning job via queue system

        return { run };
      } catch (error) {
        return handleError(reply, 'RETRY_FAILED', error);
      }
    }
  );
}

