import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  syncUser,
  getUserWithOrgs,
  signUp,
  signIn,
  signOut,
} from '../services/authService.js';
import { getInternalUser } from '../services/internalAuthService.js';
import {
  GetMeResponse,
  SignUpRequest,
  SignUpResponse,
  LoginRequest,
  LoginResponse,
} from '../types/index.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/me',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Current User',
        description: 'Get current authenticated user and their organizations.',
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string', nullable: true },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
              organizations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    billing_email: { type: 'string', format: 'email' },
                    stripe_customer_id: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
                    timezone: { type: 'string' },
                    currency: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' },
                    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
                  },
                },
              },
            },
          },
          401: {
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
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      // Sync user to ensure they exist in users table
      await syncUser(request.user.id, request.user.email);

      // Get user with organizations
      const result = await getUserWithOrgs(request.user.id);

      const response: GetMeResponse = {
        user: result.user,
        organizations: result.organizations,
      };

      return response;
    }
  );

  // Sign up
  fastify.post<{ Body: SignUpRequest }>(
    '/auth/signup',
    {
      schema: {
        summary: 'Sign Up',
        description: 'Create a new user account. If password is not provided, a temporary password will be generated.',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            name: { type: 'string' },
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
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string', nullable: true },
                },
              },
              password: { type: 'string', description: 'Temporary password (only returned if password was auto-generated)' },
              access_token: { type: 'string' },
              refresh_token: { type: 'string' },
            },
          },
          400: {
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
    async (request, reply) => {
      const { email, password: providedPassword, name } = request.body;

      if (!email) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email is required',
          },
        });
        return;
      }

      // Generate temporary password if not provided
      const password = providedPassword || generateTemporaryPassword();
      const isTemporaryPassword = !providedPassword;

      if (password.length < 6) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'password must be at least 6 characters',
          },
        });
        return;
      }

      try {
        const result = await signUp(email, password, name);
        const response: SignUpResponse & { password?: string } = {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          },
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        };

        // Return temporary password if it was auto-generated
        if (isTemporaryPassword) {
          response.password = password;
        }

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'SIGNUP_FAILED',
            message,
          },
        });
      }
    }
  );

  // Helper function to generate temporary password
  function generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Login
  fastify.post<{ Body: LoginRequest }>(
    '/auth/login',
    {
      schema: {
        summary: 'Sign In',
        description: 'Sign in with email and password.',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
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
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string', nullable: true },
                },
              },
              access_token: { type: 'string' },
              refresh_token: { type: 'string' },
            },
          },
          401: {
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
    async (request, reply) => {
      const { email, password } = request.body;

      if (!email || !password) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email and password are required',
          },
        });
        return;
      }

      try {
        const result = await signIn(email, password);
        const response: LoginResponse = {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          },
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        };
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(401).send({
          error: {
            code: 'LOGIN_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // Logout
  fastify.post(
    '/auth/logout',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Sign Out',
        description: 'Sign out the current user. Uses the token from Authorization header.',
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        consumes: ['application/json'],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          401: {
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
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!token) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token not provided',
          },
        });
        return;
      }

      try {
        await signOut(token);
        return reply.send({ message: 'Successfully signed out' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({
          error: {
            code: 'LOGOUT_FAILED',
            message,
          },
        });
      }
    }
  );

  // Admin login - same as regular login but checks if user is internal
  fastify.post<{ Body: LoginRequest }>(
    '/auth/admin/login',
    {
      schema: {
        summary: 'Admin Sign In',
        description: 'Sign in for internal users (admin dashboard).',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
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
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string', nullable: true },
                },
              },
              internal_user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  role: { type: 'string' },
                },
              },
              access_token: { type: 'string' },
              refresh_token: { type: 'string' },
            },
          },
          401: {
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
          403: {
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
    async (request, reply) => {
      const { email, password } = request.body;

      if (!email || !password) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email and password are required',
          },
        });
        return;
      }

      try {
        const result = await signIn(email, password);
        
        // Check if user is an internal user
        const internalUser = await getInternalUser(result.user.id);
        
        if (!internalUser) {
          reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Internal user access required',
            },
          });
          return;
        }

        const response = {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          },
          internal_user: {
            id: internalUser.id,
            role: internalUser.role,
          },
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        };
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(401).send({
          error: {
            code: 'LOGIN_FAILED',
            message,
          },
        });
        return;
      }
    }
  );
}

