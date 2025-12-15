import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ApiError } from '../types/index.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'An unexpected error occurred';

  // Log error for debugging (in production, use proper logging)
  if (statusCode >= 500) {
    console.error('Server error:', {
      code,
      message,
      stack: error.stack,
      path: request.url,
      method: request.method,
    });
  }

  const response: ApiError = {
    error: {
      code,
      message: statusCode >= 500 ? 'Internal server error' : message,
    },
  };

  reply.code(statusCode).send(response);
}

