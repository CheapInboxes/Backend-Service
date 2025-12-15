import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { validateMembership } from '../services/orgService.js';
import {
  createUsageEvent,
  listUsageEvents,
  getUsageEvent,
} from '../services/usageService.js';
import {
  CreateUsageEventRequest,
  CreateUsageEventResponse,
} from '../types/index.js';

export async function usageRoutes(fastify: FastifyInstance) {
  // Create usage event (manual)
  fastify.post<{ Params: { orgId: string }; Body: CreateUsageEventRequest }>(
    '/orgs/:orgId/usage-events',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Usage Event',
        description: 'Create a usage event for billing purposes.',
        tags: ['usage'],
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
          required: ['code', 'quantity'],
          properties: {
            code: { type: 'string' },
            quantity: { type: 'number', minimum: 1 },
            effective_at: { type: 'string', format: 'date-time' },
            related_ids: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              event: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  quantity: { type: 'number' },
                  effective_at: { type: 'string', format: 'date-time' },
                  created_at: { type: 'string', format: 'date-time' },
                  related_ids: { type: 'object' },
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
      const { code, quantity, effective_at, related_ids } = request.body;

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
        const event = await createUsageEvent(
          orgId,
          code,
          quantity,
          related_ids,
          effective_at ? new Date(effective_at) : undefined
        );

        const response: CreateUsageEventResponse = {
          event,
        };

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'USAGE_EVENT_CREATION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // List usage events
  fastify.get<{
    Params: { orgId: string };
    Querystring: { code?: string; start_date?: string; end_date?: string };
  }>(
    '/orgs/:orgId/usage-events',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Usage Events',
        description: 'List usage events for an organization.',
        tags: ['usage'],
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
            code: { type: 'string' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
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
                    effective_at: { type: 'string', format: 'date-time' },
                    created_at: { type: 'string', format: 'date-time' },
                    related_ids: { type: 'object' },
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
      const { code, start_date, end_date } = request.query;

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
        const filters: { code?: string; start_date?: string; end_date?: string } = {};
        if (code) filters.code = code;
        if (start_date) filters.start_date = start_date;
        if (end_date) filters.end_date = end_date;

        const events = await listUsageEvents(orgId, filters);
        return { events };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'USAGE_EVENTS_LIST_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Get usage event details
  fastify.get<{ Params: { orgId: string; eventId: string } }>(
    '/orgs/:orgId/usage-events/:eventId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Usage Event',
        description: 'Get usage event details.',
        tags: ['usage'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'eventId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              event: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  quantity: { type: 'number' },
                  effective_at: { type: 'string', format: 'date-time' },
                  created_at: { type: 'string', format: 'date-time' },
                  related_ids: { type: 'object' },
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

      const { orgId, eventId } = request.params;

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
        const event = await getUsageEvent(eventId, orgId);
        return { event };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found')) {
          reply.code(404).send({
            error: {
              code: 'USAGE_EVENT_NOT_FOUND',
              message,
            },
          });
          return;
        }
        reply.code(400).send({
          error: {
            code: 'USAGE_EVENT_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

