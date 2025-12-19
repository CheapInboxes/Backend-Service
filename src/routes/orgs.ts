import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import {
  createOrganization,
  getUserOrganizations,
  getOrganization,
} from '../services/orgService.js';
import { CreateOrgRequest, CreateOrgResponse, GetOrgResponse } from '../types/index.js';
import { supabase } from '../clients/infrastructure/supabase.js';
import { sendTeamMemberInvited } from '../clients/notifications/index.js';
import { randomUUID } from 'crypto';

export async function orgRoutes(fastify: FastifyInstance) {
  // Create organization
  fastify.post<{ Body: CreateOrgRequest }>(
    '/orgs',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Create Organization',
        description: 'Create a new organization. The authenticated user becomes the owner.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'billingEmail'],
          properties: {
            name: { type: 'string' },
            billingEmail: { type: 'string', format: 'email' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              organization: {
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
                },
              },
              membership: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'string', format: 'uuid' },
                  role: { type: 'string', enum: ['owner', 'admin', 'member'] },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
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

      const { name, billingEmail } = request.body;

      if (!name || !billingEmail) {
        reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name and billingEmail are required',
          },
        });
        return;
      }

      try {
        const result = await createOrganization(name, billingEmail, request.user.id);

        const response: CreateOrgResponse = {
          organization: result.organization,
          membership: result.membership,
        };

        reply.code(201).send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.code(400).send({
          error: {
            code: 'ORG_CREATION_FAILED',
            message,
          },
        });
        return;
      }
    }
  );

  // List user's organizations
  fastify.get(
    '/orgs',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'List Organizations',
        description: 'List all organizations the authenticated user is a member of.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
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

      const organizations = await getUserOrganizations(request.user.id);
      return { organizations };
    }
  );

  // Get organization details
  fastify.get<{ Params: { orgId: string } }>(
    '/orgs/:orgId',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Get Organization',
        description: 'Get organization details. Requires membership in the organization.',
        tags: ['organizations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid', description: 'The organization ID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organization: {
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
                },
              },
              role: { type: 'string', enum: ['owner', 'admin', 'member'] },
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
      if (!request.user) {
        reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        });
        return;
      }

      const { orgId } = request.params;

      try {
        const result = await getOrganization(orgId, request.user.id);
        const response: GetOrgResponse = {
          organization: result.organization,
          role: result.role,
        };
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found') || message.includes('not a member')) {
          reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Organization not found or you are not a member',
            },
          });
          return;
        }
        throw error;
      }
    }
  );

  // Invite team member
  fastify.post<{
    Params: { orgId: string };
    Body: { email: string; role?: 'admin' | 'member' };
  }>(
    '/orgs/:orgId/members',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Invite Team Member',
        description: 'Send an invitation to a new team member.',
        tags: ['organizations'],
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
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              invite_id: { type: 'string' },
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
      if (!request.user) {
        reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const { orgId } = request.params;
      const { email, role: _role = 'member' } = request.body;

      // Validate membership and check if user is admin/owner
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', request.user.id)
        .single();

      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Only owners and admins can invite team members' },
        });
        return;
      }

      // Check if user is already a member
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        const { data: existingMember } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', orgId)
          .eq('user_id', existingUser.id)
          .single();

        if (existingMember) {
          reply.code(400).send({
            error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this organization' },
          });
          return;
        }
      }

      // Get org details for the notification
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      // Get inviter details
      const { data: inviter } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', request.user.id)
        .single();

      // Create invite token
      const inviteId = randomUUID();
      const inviteToken = randomUUID();

      // Store invite (you may need to create an invites table, or use a simple approach)
      // For now, we'll create the membership directly if user exists, or send invite
      const inviteLink = `https://app.cheapinboxes.com/invite/${inviteToken}`;

      // Send invite email
      try {
        await sendTeamMemberInvited(email, {
          inviterName: inviter?.name || inviter?.email || 'A team member',
          orgName: org?.name || 'the organization',
          inviteLink,
        });
        console.log(`[OrgInvite] Sent invite to ${email} for org ${orgId}`);

        reply.code(201).send({
          message: 'Invitation sent successfully',
          invite_id: inviteId,
        });
      } catch (emailErr: any) {
        console.error(`[OrgInvite] Failed to send invite email:`, emailErr.message);
        reply.code(400).send({
          error: { code: 'INVITE_FAILED', message: 'Failed to send invitation email' },
        });
      }
    }
  );
}

