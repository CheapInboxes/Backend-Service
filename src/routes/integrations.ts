import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { validateMembership } from '../services/orgService.js';
import { supabase as supabaseAdmin } from '../clients/infrastructure/supabase.js';
import { getSendingPlatformClient } from '../clients/sending-platforms/index.js';
import { encryptCredentials, getIntegrationCredentials, IntegrationCredentials } from '../utils/encryption.js';
import { sendIntegrationConnected } from '../clients/notifications/index.js';

// Types
type SendingPlatform = 'instantly' | 'smartlead' | 'emailbison' | 'plusvibe';

interface Mailbox {
  id: string;
  organization_id: string;
  domain_id: string;
  full_email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  status: string;
  source_provider: string;
  external_refs: Record<string, any>;
  daily_limit: number;
  created_at: string;
}

const VALID_SENDING_PLATFORMS: SendingPlatform[] = ['instantly', 'smartlead', 'emailbison', 'plusvibe'];

export async function integrationRoutes(fastify: FastifyInstance) {
  // List integrations for an organization
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/integrations',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Integrations',
        description: 'List all integrations for an organization.',
        tags: ['integrations'],
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
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId } = request.params;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      const { data: integrations, error } = await supabaseAdmin
        .from('integrations')
        .select('id, organization_id, type, provider, status, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        reply.code(500).send({
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
        return;
      }

      return { integrations: integrations || [] };
    }
  );

  // Create integration
  fastify.post<{
    Params: { orgId: string };
    Body: { provider: SendingPlatform; api_key: string; base_url?: string };
  }>(
    '/orgs/:orgId/integrations',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Integration',
        description: 'Create a new sending platform integration. Validates the API key before saving.',
        tags: ['integrations'],
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
          required: ['provider', 'api_key'],
          properties: {
            provider: { type: 'string', enum: VALID_SENDING_PLATFORMS },
            api_key: { type: 'string', minLength: 1 },
            base_url: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              integration: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  type: { type: 'string' },
                  provider: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          409: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId } = request.params;
      const { provider, api_key, base_url } = request.body;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      // EmailBison requires a base_url
      if (provider === 'emailbison' && !base_url) {
        reply.code(400).send({
          error: { code: 'MISSING_BASE_URL', message: 'EmailBison requires a base URL' },
        });
        return;
      }

      // Check if integration already exists for this provider
      const { data: existing } = await supabaseAdmin
        .from('integrations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('provider', provider)
        .eq('type', 'sending')
        .single();

      if (existing) {
        reply.code(409).send({
          error: {
            code: 'INTEGRATION_EXISTS',
            message: `Integration with ${provider} already exists. Update it instead.`,
          },
        });
        return;
      }

      // Validate API key with the platform
      try {
        const client = getSendingPlatformClient(provider);
        const isValid = await client.validateApiKey(api_key, base_url);
        if (!isValid) {
          reply.code(400).send({
            error: { code: 'INVALID_API_KEY', message: `Invalid API key for ${provider}` },
          });
          return;
        }
      } catch (err) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: `Could not validate API key: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        });
        return;
      }

      // Encrypt credentials before storing
      const credentials: IntegrationCredentials = {
        api_key,
        ...(base_url && { base_url }),
      };
      const encryptedCredentials = encryptCredentials(credentials);

      const { data: integration, error } = await supabaseAdmin
        .from('integrations')
        .insert({
          organization_id: orgId,
          type: 'sending',
          provider,
          credential_ref: encryptedCredentials,
          status: 'active',
        })
        .select('id, organization_id, type, provider, status, created_at')
        .single();

      if (error) {
        reply.code(500).send({
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
        return;
      }

      reply.code(201).send({ integration });
    }
  );

  // Update integration
  fastify.patch<{
    Params: { orgId: string; integrationId: string };
    Body: { api_key?: string; base_url?: string; status?: 'active' | 'disabled' };
  }>(
    '/orgs/:orgId/integrations/:integrationId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Update Integration',
        description: 'Update an integration (new API key or enable/disable).',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'integrationId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            api_key: { type: 'string', minLength: 1 },
            base_url: { type: 'string' },
            status: { type: 'string', enum: ['active', 'disabled'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              integration: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  type: { type: 'string' },
                  provider: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId, integrationId } = request.params;
      const { api_key, base_url, status } = request.body;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      // Get existing integration
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .eq('organization_id', orgId)
        .single();

      if (fetchError || !existing) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Integration not found' },
        });
        return;
      }

      const updates: Record<string, any> = {};

      // Get existing decrypted credentials
      const existingCredentials = getIntegrationCredentials(existing);

      // If updating API key or base_url, validate and re-encrypt
      if (api_key || base_url) {
        const newApiKey = api_key || existingCredentials.api_key;
        const newBaseUrl = base_url || existingCredentials.base_url;

        // Validate the new API key
        try {
          const client = getSendingPlatformClient(existing.provider as SendingPlatform);
          const isValid = await client.validateApiKey(newApiKey, newBaseUrl);
          if (!isValid) {
            reply.code(400).send({
              error: { code: 'INVALID_API_KEY', message: `Invalid API key for ${existing.provider}` },
            });
            return;
          }
        } catch (err) {
          reply.code(400).send({
            error: {
              code: 'VALIDATION_FAILED',
              message: `Could not validate API key: ${err instanceof Error ? err.message : 'Unknown error'}`,
            },
          });
          return;
        }

        // Encrypt updated credentials
        const newCredentials: IntegrationCredentials = {
          api_key: newApiKey,
          ...(newBaseUrl && { base_url: newBaseUrl }),
        };
        updates.credential_ref = encryptCredentials(newCredentials);
        updates.status = 'active'; // Reactivate if key was invalid before
      }

      if (status) {
        updates.status = status;
      }

      if (Object.keys(updates).length === 0) {
        reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'No updates provided' },
        });
        return;
      }

      const { data: integration, error } = await supabaseAdmin
        .from('integrations')
        .update(updates)
        .eq('id', integrationId)
        .select('id, organization_id, type, provider, status, created_at')
        .single();

      if (error) {
        reply.code(500).send({
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
        return;
      }

      return { integration };
    }
  );

  // Delete integration
  fastify.delete<{ Params: { orgId: string; integrationId: string } }>(
    '/orgs/:orgId/integrations/:integrationId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Delete Integration',
        description: 'Remove a sending platform integration.',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'integrationId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId, integrationId } = request.params;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      const { error } = await supabaseAdmin
        .from('integrations')
        .delete()
        .eq('id', integrationId)
        .eq('organization_id', orgId);

      if (error) {
        reply.code(500).send({
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
        return;
      }

      return { success: true };
    }
  );

  // Sync all mailboxes to a platform
  fastify.post<{
    Params: { orgId: string; integrationId: string };
    Body: { mailbox_ids?: string[] };
  }>(
    '/orgs/:orgId/integrations/:integrationId/sync',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Sync Mailboxes to Platform',
        description: 'Push mailboxes to the sending platform. If mailbox_ids not provided, syncs all active mailboxes.',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'integrationId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            mailbox_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              synced: { type: 'number' },
              failed: { type: 'number' },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    mailbox_id: { type: 'string' },
                    email: { type: 'string' },
                    success: { type: 'boolean' },
                    external_id: { type: 'string', nullable: true },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId, integrationId } = request.params;
      const { mailbox_ids } = request.body;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      // Get integration with credentials
      const { data: integration, error: intError } = await supabaseAdmin
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .eq('organization_id', orgId)
        .single();

      if (intError || !integration) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Integration not found' },
        });
        return;
      }

      if (integration.status !== 'active') {
        reply.code(400).send({
          error: { code: 'INTEGRATION_INACTIVE', message: 'Integration is not active' },
        });
        return;
      }

      // Get mailboxes to sync
      let query = supabaseAdmin
        .from('mailboxes')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active');

      if (mailbox_ids && mailbox_ids.length > 0) {
        query = query.in('id', mailbox_ids);
      }

      const { data: mailboxes, error: mbError } = await query;

      if (mbError) {
        reply.code(500).send({
          error: { code: 'DATABASE_ERROR', message: mbError.message },
        });
        return;
      }

      if (!mailboxes || mailboxes.length === 0) {
        return { synced: 0, failed: 0, results: [] };
      }

      // Decrypt credentials
      // Get decrypted credentials
      const credentials = getIntegrationCredentials(integration);

      // Sync each mailbox to the platform
      const client = getSendingPlatformClient(integration.provider as SendingPlatform);
      const results: Array<{
        mailbox_id: string;
        email: string;
        success: boolean;
        external_id: string | null;
        error: string | null;
      }> = [];

      for (const mailbox of mailboxes as Mailbox[]) {
        // Skip if already synced to this platform
        const existingRef = mailbox.external_refs?.[`${integration.provider}_id`];
        if (existingRef) {
          results.push({
            mailbox_id: mailbox.id,
            email: mailbox.full_email,
            success: true,
            external_id: existingRef,
            error: null,
          });
          continue;
        }

        try {
          const { externalId } = await client.addMailbox(credentials.api_key, {
            email: mailbox.full_email,
            firstName: mailbox.first_name || '',
            lastName: mailbox.last_name || '',
          }, credentials.base_url);

          // Update mailbox with external ref
          const newExternalRefs = {
            ...mailbox.external_refs,
            [`${integration.provider}_id`]: externalId,
          };

          await supabaseAdmin
            .from('mailboxes')
            .update({ external_refs: newExternalRefs })
            .eq('id', mailbox.id);

          results.push({
            mailbox_id: mailbox.id,
            email: mailbox.full_email,
            success: true,
            external_id: externalId,
            error: null,
          });
        } catch (err) {
          results.push({
            mailbox_id: mailbox.id,
            email: mailbox.full_email,
            success: false,
            external_id: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      const synced = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      // Send integration connected notification if any mailboxes were synced
      if (synced > 0) {
        try {
          const { data: org } = await supabaseAdmin
            .from('organizations')
            .select('billing_email')
            .eq('id', orgId)
            .single();

          if (org?.billing_email) {
            await sendIntegrationConnected(org.billing_email, {
              platformName: integration.provider.charAt(0).toUpperCase() + integration.provider.slice(1),
              mailboxCount: synced,
            });
            console.log(`[IntegrationSync] Sent integration connected notification to ${org.billing_email}`);
          }
        } catch (emailErr: any) {
          console.error(`[IntegrationSync] Failed to send notification:`, emailErr.message);
        }
      }

      return { synced, failed, results };
    }
  );

  // Sync single mailbox
  fastify.post<{
    Params: { orgId: string; mailboxId: string };
    Body: { provider: SendingPlatform };
  }>(
    '/orgs/:orgId/mailboxes/:mailboxId/sync',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Sync Single Mailbox',
        description: 'Push a single mailbox to a sending platform.',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'mailboxId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            mailboxId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['provider'],
          properties: {
            provider: { type: 'string', enum: VALID_SENDING_PLATFORMS },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              external_id: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId, mailboxId } = request.params;
      const { provider } = request.body;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      // Get integration for this provider
      const { data: integration, error: intError } = await supabaseAdmin
        .from('integrations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('provider', provider)
        .eq('type', 'sending')
        .eq('status', 'active')
        .single();

      if (intError || !integration) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: `No active ${provider} integration found` },
        });
        return;
      }

      // Get mailbox
      const { data: mailbox, error: mbError } = await supabaseAdmin
        .from('mailboxes')
        .select('*')
        .eq('id', mailboxId)
        .eq('organization_id', orgId)
        .single();

      if (mbError || !mailbox) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Mailbox not found' },
        });
        return;
      }

      // Check if already synced
      const existingRef = mailbox.external_refs?.[`${provider}_id`];
      if (existingRef) {
        return { success: true, external_id: existingRef };
      }

      // Decrypt credentials
      // Get decrypted credentials
      const credentials = getIntegrationCredentials(integration);

      // Sync to platform
      try {
        const client = getSendingPlatformClient(provider);
        const { externalId } = await client.addMailbox(credentials.api_key, {
          email: mailbox.full_email,
          firstName: mailbox.first_name || '',
          lastName: mailbox.last_name || '',
        }, credentials.base_url);

        // Update mailbox with external ref
        const newExternalRefs = {
          ...mailbox.external_refs,
          [`${provider}_id`]: externalId,
        };

        await supabaseAdmin
          .from('mailboxes')
          .update({ external_refs: newExternalRefs })
          .eq('id', mailboxId);

        return { success: true, external_id: externalId };
      } catch (err) {
        reply.code(400).send({
          error: {
            code: 'SYNC_FAILED',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
        });
        return;
      }
    }
  );

  // Remove mailbox from platform
  fastify.delete<{
    Params: { orgId: string; mailboxId: string };
    Body: { provider: SendingPlatform };
  }>(
    '/orgs/:orgId/mailboxes/:mailboxId/sync',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Remove Mailbox from Platform',
        description: 'Remove a mailbox from a sending platform.',
        tags: ['integrations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'mailboxId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            mailboxId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['provider'],
          properties: {
            provider: { type: 'string', enum: VALID_SENDING_PLATFORMS },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
          403: { $ref: 'ApiError#' },
          404: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId, mailboxId } = request.params;
      const { provider } = request.body;

      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' },
        });
        return;
      }

      // Get integration
      const { data: integration, error: intError } = await supabaseAdmin
        .from('integrations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('provider', provider)
        .eq('type', 'sending')
        .single();

      if (intError || !integration) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: `No ${provider} integration found` },
        });
        return;
      }

      // Get mailbox
      const { data: mailbox, error: mbError } = await supabaseAdmin
        .from('mailboxes')
        .select('*')
        .eq('id', mailboxId)
        .eq('organization_id', orgId)
        .single();

      if (mbError || !mailbox) {
        reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Mailbox not found' },
        });
        return;
      }

      const externalRef = mailbox.external_refs?.[`${provider}_id`];
      if (!externalRef) {
        // Already not synced
        return { success: true };
      }

      // Decrypt credentials
      // Get decrypted credentials
      const credentials = getIntegrationCredentials(integration);

      // Remove from platform
      try {
        const client = getSendingPlatformClient(provider);
        await client.removeMailbox(credentials.api_key, externalRef, credentials.base_url);

        // Remove external ref from mailbox
        const newExternalRefs = { ...mailbox.external_refs };
        delete newExternalRefs[`${provider}_id`];

        await supabaseAdmin
          .from('mailboxes')
          .update({ external_refs: newExternalRefs })
          .eq('id', mailboxId);

        return { success: true };
      } catch (err) {
        reply.code(400).send({
          error: {
            code: 'REMOVE_FAILED',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
        });
        return;
      }
    }
  );
}

