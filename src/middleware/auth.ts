import { FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../clients/infrastructure/supabase.js';
import { AuthUser } from '../types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
      return;
    }

    request.user = {
      id: user.id,
      email: user.email || '',
    };
  } catch (error) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token verification failed',
      },
    });
  }
}

