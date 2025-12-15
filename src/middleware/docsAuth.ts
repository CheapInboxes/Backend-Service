import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';

/**
 * Middleware to protect API documentation routes
 * Uses Basic Authentication if credentials are configured
 */
export async function docsAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip auth in development if no credentials are set
  if (env.NODE_ENV === 'development' && !env.API_DOCS_USERNAME) {
    return;
  }

  // Require auth in production or if credentials are configured
  if (env.API_DOCS_USERNAME && env.API_DOCS_PASSWORD) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply.code(401);
      reply.header('WWW-Authenticate', 'Basic realm="API Documentation"');
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API documentation requires authentication',
        },
      });
    }

    // Decode Basic Auth credentials
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Validate credentials
    if (username !== env.API_DOCS_USERNAME || password !== env.API_DOCS_PASSWORD) {
      reply.code(401);
      reply.header('WWW-Authenticate', 'Basic realm="API Documentation"');
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        },
      });
    }
  } else if (env.NODE_ENV === 'production') {
    // In production without credentials configured, block access completely
    reply.code(403);
    return reply.send({
      error: {
        code: 'FORBIDDEN',
        message: 'API documentation is not available in production',
      },
    });
  }
}

