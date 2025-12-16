import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  createCheckoutSession,
  getOrderWithItems,
  getPendingConfigOrder,
  getOrderByCheckoutSession,
  completeOrder,
  type CartSnapshot,
  type MailboxConfig,
} from '../services/orderService.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // ==================== Checkout ====================

  /**
   * Create a Stripe Checkout session for purchasing domains and mailboxes
   * Returns client_secret for embedded checkout
   */
  fastify.post<{
    Params: { orgId: string };
    Body: {
      cart: CartSnapshot;
      return_url: string;
    };
  }>(
    '/orgs/:orgId/orders/checkout',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Create a Stripe Checkout session for embedded checkout. Returns client_secret.',
        tags: ['orders'],
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
          required: ['cart', 'return_url'],
          properties: {
            cart: {
              type: 'object',
              required: ['domains', 'totals'],
              properties: {
                domains: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      domain: { type: 'string' },
                      available: { type: 'boolean' },
                      price: { type: 'number' },
                      tld: { type: 'string' },
                      mailboxes: {
                        type: 'object',
                        properties: {
                          provider: { type: 'string', enum: ['google', 'microsoft'] },
                          count: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                totals: {
                  type: 'object',
                  properties: {
                    domainTotal: { type: 'number' },
                    mailboxMonthly: { type: 'number' },
                    totalGoogleMailboxes: { type: 'number' },
                    totalMicrosoftMailboxes: { type: 'number' },
                  },
                },
              },
            },
            return_url: { type: 'string', format: 'uri' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              client_secret: { type: 'string' },
              order_id: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError' },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;
      const { cart, return_url } = request.body;

      // Validate cart has items
      if (!cart.domains || cart.domains.length === 0) {
        return reply.code(400).send({ error: { code: 'EMPTY_CART', message: 'Cart is empty' } });
      }

      try {
        const { sessionId, clientSecret, orderId } = await createCheckoutSession(
          orgId,
          cart,
          return_url
        );
        return { session_id: sessionId, client_secret: clientSecret, order_id: orderId };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'CHECKOUT_FAILED', message } });
      }
    }
  );

  // ==================== Orders ====================

  /**
   * Get an order by ID with its domains and mailboxes
   */
  fastify.get<{ Params: { orgId: string; orderId: string } }>(
    '/orgs/:orgId/orders/:orderId',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get an order with its associated domains and mailboxes.',
        tags: ['orders'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'orderId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              order: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  organization_id: { type: 'string' },
                  stripe_checkout_session_id: { type: 'string', nullable: true },
                  stripe_subscription_id: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  cart_snapshot: { type: 'object' },
                  created_at: { type: 'string' },
                },
              },
              domains: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    domain: { type: 'string' },
                    status: { type: 'string' },
                  },
                },
              },
              mailboxes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    domain_id: { type: 'string' },
                    full_email: { type: 'string' },
                    first_name: { type: 'string', nullable: true },
                    last_name: { type: 'string', nullable: true },
                    profile_picture_url: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    source_provider: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId, orderId } = request.params;

      try {
        const result = await getOrderWithItems(orderId, orgId);
        if (!result) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORDER_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Get the most recent order needing configuration
   */
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId/orders/pending-config',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get the most recent order that needs mailbox configuration.',
        tags: ['orders'],
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
              order: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string' },
                  organization_id: { type: 'string' },
                  status: { type: 'string' },
                  cart_snapshot: { type: 'object' },
                  created_at: { type: 'string' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId } = request.params;

      try {
        const order = await getPendingConfigOrder(orgId);
        return { order };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORDER_FETCH_FAILED', message } });
      }
    }
  );

  /**
   * Get order by checkout session ID (for success page)
   */
  fastify.get<{ Params: { orgId: string }; Querystring: { session_id: string } }>(
    '/orgs/:orgId/orders/by-session',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Get an order by its Stripe checkout session ID.',
        tags: ['orders'],
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
          required: ['session_id'],
          properties: {
            session_id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              order: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string' },
                  organization_id: { type: 'string' },
                  status: { type: 'string' },
                  cart_snapshot: { type: 'object' },
                  created_at: { type: 'string' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { session_id } = request.query;

      try {
        const order = await getOrderByCheckoutSession(session_id);
        return { order };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: { code: 'ORDER_FETCH_FAILED', message } });
      }
    }
  );

  // ==================== Complete Order ====================

  /**
   * Complete an order by submitting final mailbox configurations
   */
  fastify.post<{
    Params: { orgId: string; orderId: string };
    Body: { mailbox_configs: MailboxConfig[] };
  }>(
    '/orgs/:orgId/orders/:orderId/complete',
    {
      preHandler: authMiddleware,
      schema: {
        description: 'Complete an order by submitting mailbox configurations and starting provisioning.',
        tags: ['orders'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'orderId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['mailbox_configs'],
          properties: {
            mailbox_configs: {
              type: 'array',
              items: {
                type: 'object',
                required: ['mailbox_id', 'first_name', 'last_name', 'full_email'],
                properties: {
                  mailbox_id: { type: 'string', format: 'uuid' },
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  full_email: { type: 'string', format: 'email' },
                  profile_picture_url: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              order: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                },
              },
              message: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError' },
          401: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }

      const { orgId, orderId } = request.params;
      const { mailbox_configs } = request.body;

      if (!mailbox_configs || mailbox_configs.length === 0) {
        return reply.code(400).send({ error: { code: 'NO_CONFIGS', message: 'No mailbox configurations provided' } });
      }

      try {
        const order = await completeOrder(orderId, orgId, mailbox_configs);
        return {
          order: { id: order.id, status: order.status },
          message: 'Order completed. Provisioning has started.',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message === 'Order not found') {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message } });
        }
        return reply.code(400).send({ error: { code: 'COMPLETE_FAILED', message } });
      }
    }
  );
}

