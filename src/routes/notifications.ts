import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { sendEmail, sendWelcome } from '../clients/notifications/index.js';

/**
 * Notification routes for testing and manual sends (admin-only)
 */
export async function notificationRoutes(fastify: FastifyInstance) {
  /**
   * Test email send - useful for verifying Resend is configured correctly
   */
  fastify.post<{
    Body: {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };
  }>(
    '/admin/notifications/test',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Send Test Email',
        description: 'Send a test email to verify Resend configuration. Admin only.',
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['to', 'subject', 'html'],
          properties: {
            to: { type: 'string', format: 'email' },
            subject: { type: 'string' },
            html: { type: 'string' },
            text: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              id: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
      }

      // TODO: Add admin role check here

      const { to, subject, html, text } = request.body;

      try {
        const result = await sendEmail({ to, subject, html, text });
        return { success: true, id: result.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({
          error: { code: 'EMAIL_FAILED', message },
        });
      }
    }
  );

  /**
   * Send welcome email to a user
   */
  fastify.post<{
    Body: {
      to: string;
      name?: string;
    };
  }>(
    '/admin/notifications/welcome',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Send Welcome Email',
        description: 'Send a welcome email to a new user. Admin only.',
        tags: ['notifications'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['to'],
          properties: {
            to: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              id: { type: 'string' },
            },
          },
          400: { $ref: 'ApiError#' },
          401: { $ref: 'ApiError#' },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
      }

      const { to, name } = request.body;

      try {
        const result = await sendWelcome(to, { name });
        return { success: true, id: result.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({
          error: { code: 'EMAIL_FAILED', message },
        });
      }
    }
  );
}

