import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { validateMembership } from '../services/orgService.js';
import { automationClient } from '../clients/automation/client.js';

interface ConnectBody {
  username: string;
  password: string;
}

interface VerifyBody {
  code: string;
}

interface SetNameserversBody {
  domains: string[];
  nameservers: string[];
}

interface SessionParams {
  orgId: string;
  sessionId: string;
}

export async function namecheapImportRoutes(fastify: FastifyInstance) {
  /**
   * Start Namecheap connection/login flow
   */
  fastify.post<{ Params: { orgId: string }; Body: ConnectBody }>(
    '/orgs/:orgId/namecheap/connect',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Start Namecheap Import',
        description: 'Start the Namecheap login flow to import domains.',
        tags: ['namecheap-import'],
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
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              sessionId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.params;
      const { username, password } = request.body;
      const userId = request.user!.sub;

      // Validate user has access to org
      await validateMembership(orgId, userId);

      try {
        const result = await automationClient.namecheap.connect(username, password, orgId);
        return { success: true, sessionId: result.sessionId };
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Namecheap connect failed');
        return reply.status(500).send({ 
          error: { code: 'NAMECHEAP_CONNECT_FAILED', message: error.message } 
        });
      }
    }
  );

  /**
   * Get session status (for polling)
   */
  fastify.get<{ Params: SessionParams }>(
    '/orgs/:orgId/namecheap/:sessionId/status',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Namecheap Session Status',
        description: 'Poll the status of a Namecheap import session.',
        tags: ['namecheap-import'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'sessionId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              domains: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                    expiry: { type: 'string' },
                  },
                },
              },
              error: { type: 'string' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId, sessionId } = request.params;
      const userId = request.user!.sub;

      await validateMembership(orgId, userId);

      try {
        const result = await automationClient.namecheap.getStatus(sessionId);
        return result;
      } catch (error: any) {
        if (error.status === 404) {
          return reply.status(404).send({ 
            error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or expired' } 
          });
        }
        fastify.log.error({ error: error.message }, 'Namecheap status check failed');
        return reply.status(500).send({ 
          error: { code: 'STATUS_CHECK_FAILED', message: error.message } 
        });
      }
    }
  );

  /**
   * Submit 2FA verification code
   */
  fastify.post<{ Params: SessionParams; Body: VerifyBody }>(
    '/orgs/:orgId/namecheap/:sessionId/verify',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Submit 2FA Code',
        description: 'Submit the 2FA verification code for Namecheap login.',
        tags: ['namecheap-import'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'sessionId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId, sessionId } = request.params;
      const { code } = request.body;
      const userId = request.user!.sub;

      await validateMembership(orgId, userId);

      try {
        const result = await automationClient.namecheap.verify(sessionId, code);
        return result;
      } catch (error: any) {
        if (error.status === 404) {
          return reply.status(404).send({ 
            error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or expired' } 
          });
        }
        if (error.status === 400) {
          return reply.status(400).send({ 
            error: { code: 'INVALID_STATE', message: error.message } 
          });
        }
        fastify.log.error({ error: error.message }, 'Namecheap verify failed');
        return reply.status(500).send({ 
          error: { code: 'VERIFY_FAILED', message: error.message } 
        });
      }
    }
  );

  /**
   * Set nameservers for selected domains
   */
  fastify.post<{ Params: SessionParams; Body: SetNameserversBody }>(
    '/orgs/:orgId/namecheap/:sessionId/set-nameservers',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Set Nameservers',
        description: 'Update nameservers for selected Namecheap domains.',
        tags: ['namecheap-import'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'sessionId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['domains', 'nameservers'],
          properties: {
            domains: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
            nameservers: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId, sessionId } = request.params;
      const { domains, nameservers } = request.body;
      const userId = request.user!.sub;

      await validateMembership(orgId, userId);

      try {
        const result = await automationClient.namecheap.setNameservers(sessionId, domains, nameservers);
        return { success: true, message: result.message };
      } catch (error: any) {
        if (error.status === 404) {
          return reply.status(404).send({ 
            error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or expired' } 
          });
        }
        if (error.status === 400) {
          return reply.status(400).send({ 
            error: { code: 'INVALID_STATE', message: error.message } 
          });
        }
        fastify.log.error({ error: error.message }, 'Namecheap set nameservers failed');
        return reply.status(500).send({ 
          error: { code: 'SET_NAMESERVERS_FAILED', message: error.message } 
        });
      }
    }
  );

  /**
   * Get domains from a successful session
   */
  fastify.get<{ Params: SessionParams }>(
    '/orgs/:orgId/namecheap/:sessionId/domains',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Namecheap Domains',
        description: 'Get the list of domains from a successful Namecheap session.',
        tags: ['namecheap-import'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'sessionId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string' },
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
                    name: { type: 'string' },
                    status: { type: 'string' },
                    expiry: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { orgId, sessionId } = request.params;
      const userId = request.user!.sub;

      await validateMembership(orgId, userId);

      try {
        const result = await automationClient.namecheap.getDomains(sessionId);
        return result;
      } catch (error: any) {
        if (error.status === 404) {
          return reply.status(404).send({ 
            error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or expired' } 
          });
        }
        if (error.status === 400) {
          return reply.status(400).send({ 
            error: { code: 'INVALID_STATE', message: error.message } 
          });
        }
        fastify.log.error({ error: error.message }, 'Namecheap get domains failed');
        return reply.status(500).send({ 
          error: { code: 'GET_DOMAINS_FAILED', message: error.message } 
        });
      }
    }
  );
}

