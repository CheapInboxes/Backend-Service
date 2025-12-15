import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { validateMembership } from '../services/orgService.js';
import {
  createMailboxes,
  listMailboxes,
  getMailbox,
  updateMailbox,
} from '../services/mailboxService.js';
import {
  CreateMailboxesRequest,
  CreateMailboxesResponse,
} from '../types/index.js';

export async function mailboxRoutes(fastify: FastifyInstance) {
  // Create mailboxes
  fastify.post<{ Params: { orgId: string; domainId: string }; Body: CreateMailboxesRequest }>(
    '/orgs/:orgId/domains/:domainId/mailboxes',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Mailboxes',
        description: 'Create mailboxes for a domain.',
        tags: ['mailboxes'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'domainId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            domainId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['count'],
          properties: {
            count: { type: 'number', minimum: 1, maximum: 100 },
            first_name_pattern: { type: 'string' },
            last_name_pattern: { type: 'string' },
          },
        },
        response: {
          201: {
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
                    first_name: { type: 'string', nullable: true },
                    last_name: { type: 'string', nullable: true },
                    profile_picture_url: { type: 'string', nullable: true },
                    status: {
                      type: 'string',
                      enum: ['provisioning', 'active', 'paused', 'error', 'deleted'],
                    },
                    source_provider: { type: 'string' },
                    external_refs: { type: 'object' },
                    daily_limit: { type: 'number' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
              runs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    domain_id: { type: 'string', format: 'uuid' },
                    mailbox_id: { type: 'string', format: 'uuid', nullable: true },
                    initiated_by_user_id: { type: 'string', format: 'uuid', nullable: true },
                    status: {
                      type: 'string',
                      enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'],
                    },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      const { orgId, domainId } = request.params;
      const { count, first_name_pattern, last_name_pattern } = request.body;

      // Validate membership
      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this organization',
          },
        });
        return;
      }

      if (!count || count < 1 || count > 100) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'count must be between 1 and 100',
          },
        });
        return;
      }

      try {
        const result = await createMailboxes(
          orgId,
          request.user.id,
          domainId,
          count,
          first_name_pattern,
          last_name_pattern
        );

        const response: CreateMailboxesResponse = {
          mailboxes: result.mailboxes,
          runs: result.runs,
        };

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'MAILBOX_CREATION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // List mailboxes
  fastify.get<{
    Params: { orgId: string };
    Querystring: { domain_id?: string; status?: string };
  }>(
    '/orgs/:orgId/mailboxes',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Mailboxes',
        description: 'List all mailboxes for an organization.',
        tags: ['mailboxes'],
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
                    first_name: { type: 'string', nullable: true },
                    last_name: { type: 'string', nullable: true },
                    profile_picture_url: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    source_provider: { type: 'string' },
                    external_refs: { type: 'object' },
                    daily_limit: { type: 'number' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      const { orgId } = request.params;
      const { domain_id, status } = request.query;

      // Validate membership
      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this organization',
          },
        });
        return;
      }

      try {
        const filters: { status?: string } = {};
        if (status) filters.status = status;

        const mailboxes = await listMailboxes(orgId, domain_id, filters);
        return { mailboxes };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'MAILBOX_LIST_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Get mailbox details
  fastify.get<{ Params: { orgId: string; mailboxId: string } }>(
    '/orgs/:orgId/mailboxes/:mailboxId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Mailbox',
        description: 'Get mailbox details.',
        tags: ['mailboxes'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'mailboxId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            mailboxId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mailbox: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  domain_id: { type: 'string', format: 'uuid' },
                  full_email: { type: 'string' },
                  first_name: { type: 'string', nullable: true },
                  last_name: { type: 'string', nullable: true },
                  profile_picture_url: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  source_provider: { type: 'string' },
                  external_refs: { type: 'object' },
                  daily_limit: { type: 'number' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      const { orgId, mailboxId } = request.params;

      // Validate membership
      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this organization',
          },
        });
        return;
      }

      try {
        const mailbox = await getMailbox(mailboxId, orgId);
        return { mailbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found')) {
          reply.code(404).send({
            error: {
              code: 'MAILBOX_NOT_FOUND',
              message,
            },
          });
          return;
        }
        reply.code(400).send({
          error: {
            code: 'MAILBOX_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Update mailbox
  fastify.patch<{
    Params: { orgId: string; mailboxId: string };
    Body: { status?: 'active' | 'paused' };
  }>(
    '/orgs/:orgId/mailboxes/:mailboxId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Update Mailbox',
        description: 'Update mailbox (pause/resume).',
        tags: ['mailboxes'],
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
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'paused'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mailbox: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  domain_id: { type: 'string', format: 'uuid' },
                  full_email: { type: 'string' },
                  first_name: { type: 'string', nullable: true },
                  last_name: { type: 'string', nullable: true },
                  profile_picture_url: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  source_provider: { type: 'string' },
                  external_refs: { type: 'object' },
                  daily_limit: { type: 'number' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      const { orgId, mailboxId } = request.params;
      const { status } = request.body;

      // Validate membership
      const isMember = await validateMembership(orgId, request.user.id);
      if (!isMember) {
        reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this organization',
          },
        });
        return;
      }

      if (!status) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'status is required',
          },
        });
        return;
      }

      try {
        const mailbox = await updateMailbox(mailboxId, orgId, { status });
        return { mailbox };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found')) {
          reply.code(404).send({
            error: {
              code: 'MAILBOX_NOT_FOUND',
              message,
            },
          });
          return;
        }
        reply.code(400).send({
          error: {
            code: 'MAILBOX_UPDATE_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

