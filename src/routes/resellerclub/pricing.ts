import { FastifyInstance } from 'fastify';
import { createResellerClubClient } from '../../clients/domain-registrars/resellerclub/index.js';
import { env } from '../../config/env.js';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';

export async function resellerclubPricingRoutes(fastify: FastifyInstance) {
  // Get reseller pricing
  fastify.get(
    '/resellerclub/pricing/reseller',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:pricebook')],
      schema: {
        summary: 'Get Reseller Pricing',
        description: 'Get reseller pricing for all products from ResellerClub.',
        tags: ['resellerclub'],
        response: {
          200: {
            type: 'object',
            properties: {
              pricing: { type: 'object' },
            },
          },
          503: {
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
    async (_request, reply) => {
      if (!env.RESELLERCLUB_AUTH_USERID || !env.RESELLERCLUB_API_KEY) {
        reply.code(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'ResellerClub service is not configured',
          },
        });
        return;
      }

      try {
        const client = createResellerClubClient({
          authUserId: env.RESELLERCLUB_AUTH_USERID,
          apiKey: env.RESELLERCLUB_API_KEY,
          sandbox: env.RESELLERCLUB_SANDBOX,
        });

        const response = await client.getResellerPricing();

        if (response.success && response.data) {
          return { pricing: response.data };
        }

        return { pricing: {} };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'PRICING_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Get reseller balance
  fastify.get(
    '/resellerclub/balance',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:pricebook')],
      schema: {
        summary: 'Get Reseller Balance',
        description: 'Get the current reseller account balance from ResellerClub.',
        tags: ['resellerclub'],
        response: {
          200: {
            type: 'object',
            properties: {
              sellingCurrencyBalance: { type: 'number' },
              accountingCurrencyBalance: { type: 'number' },
            },
          },
          503: {
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
    async (_request, reply) => {
      if (!env.RESELLERCLUB_AUTH_USERID || !env.RESELLERCLUB_API_KEY) {
        reply.code(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'ResellerClub service is not configured',
          },
        });
        return;
      }

      try {
        const client = createResellerClubClient({
          authUserId: env.RESELLERCLUB_AUTH_USERID,
          apiKey: env.RESELLERCLUB_API_KEY,
          sandbox: env.RESELLERCLUB_SANDBOX,
        });

        const response = await client.getResellerBalance();

        if (response.success && response.data) {
          return {
            sellingCurrencyBalance: response.data.sellingcurrencybalance,
            accountingCurrencyBalance: response.data.accountingcurrencybalance,
          };
        }

        return { sellingCurrencyBalance: 0, accountingCurrencyBalance: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'BALANCE_FETCH_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

