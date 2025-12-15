import { FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from './auth.js';
import { getInternalUser, hasPermission, InternalUser } from '../services/internalAuthService.js';

declare module 'fastify' {
  interface FastifyRequest {
    internalUser?: InternalUser;
  }
}

/**
 * Middleware to check if user is an internal user (employee)
 * Must run after authMiddleware
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First ensure user is authenticated
  await authMiddleware(request, reply);

  if (!request.user) {
    return; // authMiddleware already sent response
  }

  // Check if user is an internal user
  const internalUser = await getInternalUser(request.user.id);

  if (!internalUser) {
    reply.code(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Internal user access required',
      },
    });
    return;
  }

  request.internalUser = internalUser;
}

/**
 * Factory function to create permission-checking middleware
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Ensure internal auth has run first
    if (!request.internalUser) {
      await internalAuthMiddleware(request, reply);
      if (!request.internalUser) {
        return; // Already sent response
      }
    }

    // Check permission
    const hasAccess = await hasPermission(request.user!.id, permission);

    if (!hasAccess) {
      reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `Permission required: ${permission}`,
        },
      });
      return;
    }
  };
}


