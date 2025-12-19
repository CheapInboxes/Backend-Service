import { FastifyReply } from 'fastify';

/**
 * Standard error handler for admin routes
 */
export function handleError(
  reply: FastifyReply,
  code: string,
  error: unknown,
  status = 400
) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return reply.code(status).send({ error: { code, message } });
}

/**
 * Check if error message indicates a not found condition
 */
export function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.includes('not found') || message.includes('Failed to');
}

/**
 * Pagination defaults and limits
 */
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

/**
 * Parse and validate pagination parameters
 */
export function parsePagination(query: { limit?: number; offset?: number }) {
  const limit = Math.min(
    Math.max(query.limit ?? PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT
  );
  const offset = Math.max(query.offset ?? PAGINATION.DEFAULT_OFFSET, 0);
  return { limit, offset };
}

/**
 * Common pagination query schema for Fastify
 */
export const paginationQuerySchema = {
  limit: { 
    type: 'number', 
    minimum: 1, 
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
    description: 'Number of items to return (max 100)'
  },
  offset: { 
    type: 'number', 
    minimum: 0,
    default: PAGINATION.DEFAULT_OFFSET,
    description: 'Number of items to skip'
  },
} as const;

/**
 * Paginated response wrapper
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number
) {
  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + items.length < total,
    },
  };
}

