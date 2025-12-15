import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  createOrganization,
  getUserOrganizations,
  getOrganization,
} from '../services/orgService.js';
import { CreateOrgRequest, CreateOrgResponse, GetOrgResponse } from '../types/index.js';

export async function orgRoutes(fastify: FastifyInstance) {
  // Create organization
  fastify.post<{ Body: CreateOrgRequest }>(
    '/orgs',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Organization',
        description: 'Create a new organization. The authenticated user becomes the owner.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'billingEmail'],
          properties: {
            name: { type: 'string' },
            billingEmail: { type: 'string', format: 'email' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              organization: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  billing_email: { type: 'string', format: 'email' },
                  stripe_customer_id: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
                  timezone: { type: 'string' },
                  currency: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
              membership: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'string', format: 'uuid' },
                  role: { type: 'string', enum: ['owner', 'admin', 'member'] },
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

      const { name, billingEmail } = request.body;

      if (!name || !billingEmail) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name and billingEmail are required',
          },
        });
        return;
      }

      try {
        const result = await createOrganization(name, billingEmail, request.user.id);

        const response: CreateOrgResponse = {
          organization: result.organization,
          membership: result.membership,
        };

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'ORG_CREATION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // List user's organizations
  fastify.get(
    '/orgs',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Organizations',
        description: 'List all organizations the authenticated user is a member of.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
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
                    billing_email: { type: 'string', format: 'email' },
                    stripe_customer_id: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
                    timezone: { type: 'string' },
                    currency: { type: 'string' },
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

      const organizations = await getUserOrganizations(request.user.id);
      return { organizations };
    }
  );

  // Get organization details
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Organization',
        description: 'Get organization details. Requires membership in the organization.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid', description: 'The organization ID' },
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
                  name: { type: 'string' },
                  billing_email: { type: 'string', format: 'email' },
                  stripe_customer_id: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
                  timezone: { type: 'string' },
                  currency: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
              role: { type: 'string', enum: ['owner', 'admin', 'member'] },
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

      try {
        const result = await getOrganization(orgId, request.user.id);
        const response: GetOrgResponse = {
          organization: result.organization,
          role: result.role,
        };
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found') || message.includes('not a member')) {
          reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Organization not found or you are not a member',
            },
          });
          return;
        }
        throw error;
      }
    }
  );
}

