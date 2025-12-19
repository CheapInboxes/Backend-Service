import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { getSendingPlatformClient } from '../../clients/sending-platforms/index.js';
import { getIntegrationCredentials } from '../../utils/encryption.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function integrationsRoutes(fastify: FastifyInstance) {
  /**
   * List all integrations across organizations (admin view)
   */
  fastify.get<{
    Querystring: { org_id?: string; type?: string; provider?: string; status?: string; limit?: number; offset?: number };
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
            ...paginationQuerySchema,
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
          .from('integrations')
          .select('id, organization_id, type, provider, status, created_at, organizations(name)');

        let countQuery = supabase
          .from('integrations')
          .select('*', { count: 'exact', head: true });

        if (request.query.org_id) {
          query = query.eq('organization_id', request.query.org_id);
          countQuery = countQuery.eq('organization_id', request.query.org_id);
        }
        if (request.query.type) {
          query = query.eq('type', request.query.type);
          countQuery = countQuery.eq('type', request.query.type);
        }
        if (request.query.provider) {
          query = query.eq('provider', request.query.provider);
          countQuery = countQuery.eq('provider', request.query.provider);
        }
        if (request.query.status) {
          query = query.eq('status', request.query.status);
          countQuery = countQuery.eq('status', request.query.status);
        }

        const { count } = await countQuery;

        const { data: integrations, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        // Flatten the organization data
        const flattenedIntegrations = (integrations || []).map((i: any) => ({
          ...i,
          organization: i.organizations,
          organizations: undefined,
        }));

        return {
          integrations: flattenedIntegrations,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + flattenedIntegrations.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'INTEGRATIONS_FETCH_FAILED', error);
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

        const credentials = getIntegrationCredentials(integration);

        const result = await client.validateApiKey(credentials.api_key, credentials.base_url);

        // Update status if changed
        const newStatus = result.valid ? 'active' : 'invalid';
        if (integration.status !== newStatus) {
          await supabase
            .from('integrations')
            .update({ status: newStatus })
            .eq('id', integration.id);
        }

        return {
          success: result.valid,
          message: result.valid ? 'Connection successful' : (result.error || 'Connection failed'),
          status: newStatus,
        };
      } catch (error) {
        return handleError(reply, 'TEST_FAILED', error);
      }
    }
  );
}

