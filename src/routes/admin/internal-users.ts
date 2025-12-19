import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function internalUsersRoutes(fastify: FastifyInstance) {
  // ==================== Internal Users ====================

  /**
   * List all internal users
   */
  fastify.get<{
    Querystring: { limit?: number; offset?: number };
  }>(
    '/admin/internal-users',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:internal_users')],
      schema: {
        description: 'List all internal users (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            ...paginationQuerySchema,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string' },
                    created_at: { type: 'string' },
                    deactivated_at: { type: 'string', nullable: true },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  has_more: { type: 'boolean' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { limit, offset } = parsePagination(request.query);

        const { count } = await supabase
          .from('internal_users')
          .select('*', { count: 'exact', head: true });

        const { data: users, error } = await supabase
          .from('internal_users')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        return {
          users: users || [],
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + (users?.length || 0) < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'INTERNAL_USERS_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Create internal user
   */
  fastify.post<{
    Body: {
      email: string;
      name?: string;
      role: 'support' | 'ops' | 'billing' | 'admin' | 'founder';
      password: string;
    };
  }>(
    '/admin/internal-users',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:internal_users')],
      schema: {
        description: 'Create a new internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['email', 'role', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['support', 'ops', 'billing', 'admin', 'founder'] },
            password: { type: 'string', minLength: 8 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  role: { type: 'string' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: request.body.email,
          password: request.body.password,
          email_confirm: true,
          user_metadata: {
            name: request.body.name || null,
          },
        });

        if (authError || !authUser.user) {
          throw new Error(authError?.message || 'Failed to create auth user');
        }

        const { data: internalUser, error: internalError } = await supabase
          .from('internal_users')
          .insert({
            user_id: authUser.user.id,
            email: request.body.email,
            name: request.body.name || null,
            role: request.body.role,
          })
          .select()
          .single();

        if (internalError || !internalUser) {
          await supabase.auth.admin.deleteUser(authUser.user.id);
          throw new Error(internalError?.message || 'Failed to create internal user');
        }

        return reply.code(201).send({ user: internalUser });
      } catch (error) {
        return handleError(reply, 'INTERNAL_USER_CREATE_FAILED', error);
      }
    }
  );

  /**
   * Update internal user
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      role?: 'support' | 'ops' | 'billing' | 'admin' | 'founder';
      deactivated_at?: string | null;
    };
  }>(
    '/admin/internal-users/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:internal_users')],
      schema: {
        description: 'Update an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['support', 'ops', 'billing', 'admin', 'founder'] },
            deactivated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  deactivated_at: { type: 'string', nullable: true },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { data: user, error } = await supabase
          .from('internal_users')
          .update(request.body)
          .eq('id', request.params.id)
          .select()
          .single();

        if (error || !user) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Internal user not found' } });
        }

        return { user };
      } catch (error) {
        return handleError(reply, 'INTERNAL_USER_UPDATE_FAILED', error);
      }
    }
  );

  // ==================== Permissions ====================

  /**
   * Grant permission to internal user
   */
  fastify.post<{
    Params: { id: string };
    Body: { permission: string };
  }>(
    '/admin/internal-users/:id/permissions',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:permissions')],
      schema: {
        description: 'Grant a permission to an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['permission'],
          properties: {
            permission: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              permission: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  internal_user_id: { type: 'string', format: 'uuid' },
                  permission: { type: 'string' },
                  granted_at: { type: 'string' },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          400: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { data: perm, error } = await supabase
          .from('internal_user_permissions')
          .insert({
            internal_user_id: request.params.id,
            permission: request.body.permission,
            granted_by: request.internalUser!.id,
          })
          .select()
          .single();

        if (error || !perm) {
          const message = error?.message || 'Unknown error';
          if (message.includes('duplicate') || message.includes('unique')) {
            return reply.code(400).send({ error: { code: 'PERMISSION_ALREADY_GRANTED', message: 'Permission already granted' } });
          }
          return handleError(reply, 'PERMISSION_GRANT_FAILED', error);
        }

        return reply.code(201).send({ permission: perm });
      } catch (error) {
        return handleError(reply, 'PERMISSION_GRANT_FAILED', error);
      }
    }
  );

  /**
   * Revoke permission from internal user
   */
  fastify.delete<{
    Params: { id: string; permission: string };
  }>(
    '/admin/internal-users/:id/permissions/:permission',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:permissions')],
      schema: {
        description: 'Revoke a permission from an internal user (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'permission'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            permission: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { error } = await supabase
          .from('internal_user_permissions')
          .delete()
          .eq('internal_user_id', request.params.id)
          .eq('permission', request.params.permission);

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (error) {
        return handleError(reply, 'PERMISSION_REVOKE_FAILED', error);
      }
    }
  );

  // ==================== Session Management ====================

  /**
   * List all active sessions for internal users
   */
  fastify.get(
    '/admin/sessions',
    {
      preHandler: [internalAuthMiddleware, requirePermission('superadmin')],
      schema: {
        description: 'List all active sessions for internal users (superadmin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              sessions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    session_id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    role: { type: 'string' },
                    user_agent: { type: 'string', nullable: true },
                    ip: { type: 'string', nullable: true },
                    aal: { type: 'string' },
                    created_at: { type: 'string' },
                    refreshed_at: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
        },
      },
    },
    async (_request, reply) => {
      try {
        const { data, error } = await supabase.rpc('get_internal_user_sessions');
        
        if (error) {
          throw new Error(error.message);
        }

        return { sessions: data || [] };
      } catch (error) {
        return handleError(reply, 'SESSIONS_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Terminate a specific session
   */
  fastify.delete<{ Params: { sessionId: string } }>(
    '/admin/sessions/:sessionId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('superadmin')],
      schema: {
        description: 'Terminate a specific session (superadmin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: { $ref: 'ApiError' },
          403: { $ref: 'ApiError' },
          404: { $ref: 'ApiError' },
        },
      },
    },
    async (request, reply) => {
      try {
        const { error } = await supabase.rpc('terminate_session', {
          target_session_id: request.params.sessionId,
        });

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (error) {
        return handleError(reply, 'SESSION_TERMINATE_FAILED', error);
      }
    }
  );
}

