import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { validateMembership } from '../services/orgService.js';
import {
  createDomain,
  listDomains,
  getDomain,
  getDomainRuns,
} from '../services/domainService.js';
import {
  CreateDomainRequest,
  CreateDomainResponse,
} from '../types/index.js';

export async function domainRoutes(fastify: FastifyInstance) {
  // Create domain
  fastify.post<{ Params: { orgId: string }; Body: CreateDomainRequest }>(
    '/orgs/:orgId/domains',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Domain',
        description: 'Create a new domain for an organization.',
        tags: ['domains'],
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
          required: ['domain', 'source_provider'],
          properties: {
            domain: { type: 'string' },
            source_provider: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
            auto_renew: { type: 'boolean' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              domain: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  domain: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['pending', 'provisioning', 'ready', 'error', 'suspended', 'expired'],
                  },
                  source_provider: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  external_refs: { type: 'object' },
                  auto_renew: { type: 'boolean' },
                  next_renewal_date: { type: 'string', nullable: true },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
              run: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  domain_id: { type: 'string', format: 'uuid' },
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

      const { orgId } = request.params;
      const { domain, source_provider, tags, auto_renew } = request.body;

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
        const result = await createDomain(
          orgId,
          request.user.id,
          domain,
          source_provider,
          tags,
          auto_renew
        );

        const response: CreateDomainResponse = {
          domain: result.domain,
          run: result.run,
        };

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_CREATION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // List domains
  fastify.get<{ Params: { orgId: string }; Querystring: { status?: string; tags?: string } }>(
    '/orgs/:orgId/domains',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Domains',
        description: 'List all domains for an organization.',
        tags: ['domains'],
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
            status: { type: 'string' },
            tags: { type: 'string' }, // Comma-separated tags
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
                    tags: { type: 'array', items: { type: 'string' } },
                    external_refs: { type: 'object' },
                    auto_renew: { type: 'boolean' },
                    next_renewal_date: { type: 'string', nullable: true },
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
      const { status, tags } = request.query;

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
        const filters: { status?: string; tags?: string[] } = {};
        if (status) filters.status = status;
        if (tags) filters.tags = tags.split(',').map((t) => t.trim());

        const domains = await listDomains(orgId, filters);
        return { domains };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_LIST_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Get domain details
  fastify.get<{ Params: { orgId: string; domainId: string } }>(
    '/orgs/:orgId/domains/:domainId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Domain',
        description: 'Get domain details.',
        tags: ['domains'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'domainId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            domainId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              domain: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  domain: { type: 'string' },
                  status: { type: 'string' },
                  source_provider: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  external_refs: { type: 'object' },
                  auto_renew: { type: 'boolean' },
                  next_renewal_date: { type: 'string', nullable: true },
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

      const { orgId, domainId } = request.params;

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
        const domain = await getDomain(domainId, orgId);
        return { domain };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found')) {
          reply.code(404).send({
            error: {
              code: 'DOMAIN_NOT_FOUND',
              message,
            },
          });
          return;
        }
        reply.code(400).send({
          error: {
            code: 'DOMAIN_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Get domain runs
  fastify.get<{ Params: { orgId: string; domainId: string } }>(
    '/orgs/:orgId/domains/:domainId/runs',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Domain Runs',
        description: 'Get domain runs history.',
        tags: ['domains'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'domainId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            domainId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              runs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    domain_id: { type: 'string', format: 'uuid' },
                    initiated_by_user_id: { type: 'string', format: 'uuid', nullable: true },
                    status: { type: 'string' },
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

      const { orgId, domainId } = request.params;

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
        const runs = await getDomainRuns(domainId, orgId);
        return { runs };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'DOMAIN_RUNS_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

