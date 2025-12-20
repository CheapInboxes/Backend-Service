import { FastifyInstance } from 'fastify';
import { internalAuthMiddleware, requirePermission } from '../../middleware/internalAuth.js';
import { supabase } from '../../clients/infrastructure/supabase.js';
import { getOrders } from '../../services/orderService.js';
import { getPaymentMethods } from '../../services/billingService.js';
import { handleError, parsePagination, paginationQuerySchema } from './helpers.js';

export async function organizationsRoutes(fastify: FastifyInstance) {
  // ==================== Organizations ====================

  /**
   * List all organizations
   */
  fastify.get<{
    Querystring: { status?: string; limit?: number; offset?: number };
  }>(
    '/admin/organizations',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'List all organizations (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
            ...paginationQuerySchema,
          },
        },
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
                    billing_email: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    domains_count: { type: 'number' },
                    mailboxes_count: { type: 'number' },
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

        let query = supabase.from('organizations').select('*');
        if (request.query.status) {
          query = query.eq('status', request.query.status);
        }

        // Get total count
        let countQuery = supabase
          .from('organizations')
          .select('*', { count: 'exact', head: true });
        if (request.query.status) {
          countQuery = countQuery.eq('status', request.query.status);
        }
        const { count } = await countQuery;

        // Get paginated results
        const { data: orgs, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new Error(error.message);
        }

        // Get counts for each org
        const orgsWithCounts = await Promise.all(
          (orgs || []).map(async (org) => {
            const { count: domainsCount } = await supabase
              .from('domains')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', org.id);

            const { count: mailboxesCount } = await supabase
              .from('mailboxes')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', org.id);

            return {
              ...org,
              domains_count: domainsCount || 0,
              mailboxes_count: mailboxesCount || 0,
            };
          })
        );

        return {
          organizations: orgsWithCounts,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + orgsWithCounts.length < (count || 0),
          },
        };
      } catch (error) {
        return handleError(reply, 'ORGS_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Get organization details
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/organizations/:id',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'Get organization details with members (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organization: { type: 'object' },
              members: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    user_id: { type: 'string', format: 'uuid' },
                    role: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        name: { type: 'string', nullable: true },
                      },
                    },
                  },
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
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', request.params.id)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        const { data: members, error: membersError } = await supabase
          .from('organization_members')
          .select('*, users(email, name)')
          .eq('organization_id', request.params.id);

        if (membersError) {
          throw new Error(membersError.message);
        }

        return {
          organization: org,
          members: members || [],
        };
      } catch (error) {
        return handleError(reply, 'ORG_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Get full organization details (all data in one call for SSR)
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/admin/organizations/:id/full',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'Get complete organization details including all related data in one call (admin only). Optimized for server-side rendering.',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              organization: { type: 'object' },
              members: { type: 'array' },
              domains: { type: 'array' },
              mailboxes: { type: 'array' },
              integrations: { type: 'array' },
              orders: { type: 'array' },
              subscriptions: { type: 'array' },
              invoices: { type: 'array' },
              payments: { type: 'array' },
              payment_methods: { type: 'array' },
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
        const orgId = request.params.id;

        // First fetch org to verify it exists and get stripe_customer_id
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', orgId)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        // Run all queries in parallel
        const [
          membersResult,
          domainsResult,
          mailboxesResult,
          integrationsResult,
          orders,
          subscriptionsResult,
          invoicesResult,
          paymentsResult,
          paymentMethods,
        ] = await Promise.all([
          supabase
            .from('organization_members')
            .select('*, users(email, name)')
            .eq('organization_id', orgId),
          supabase
            .from('domains')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          supabase
            .from('mailboxes')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          supabase
            .from('integrations')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          getOrders(orgId),
          supabase
            .from('subscriptions')
            .select(`
              *,
              domains(domain),
              subscription_items(id, code, quantity, unit_price_cents)
            `)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          supabase
            .from('invoices')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('*')
            .eq('organization_id', orgId)
            .order('processed_at', { ascending: false }),
          org.stripe_customer_id ? getPaymentMethods(orgId) : Promise.resolve([]),
        ]);

        // Transform subscriptions to include calculated monthly amount
        const subscriptions = (subscriptionsResult.data || []).map((sub: any) => {
          const items = sub.subscription_items || [];
          const monthlyAmount = items.reduce(
            (sum: number, item: any) => sum + item.quantity * item.unit_price_cents,
            0
          );
          return {
            id: sub.id,
            organization_id: sub.organization_id,
            order_id: sub.order_id,
            domain_id: sub.domain_id,
            status: sub.status,
            billing_anchor_day: sub.billing_anchor_day,
            next_billing_date: sub.next_billing_date,
            created_at: sub.created_at,
            cancelled_at: sub.cancelled_at,
            domain: sub.domains,
            items: items,
            monthly_amount_cents: monthlyAmount,
          };
        });

        // Transform payment methods
        const formattedPaymentMethods = paymentMethods.map((pm: any) => ({
          id: pm.id,
          type: pm.type,
          card: pm.card
            ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                exp_month: pm.card.exp_month,
                exp_year: pm.card.exp_year,
              }
            : null,
        }));

        return {
          organization: org,
          members: membersResult.data || [],
          domains: domainsResult.data || [],
          mailboxes: mailboxesResult.data || [],
          integrations: integrationsResult.data || [],
          orders,
          subscriptions,
          invoices: invoicesResult.data || [],
          payments: paymentsResult.data || [],
          payment_methods: formattedPaymentMethods,
        };
      } catch (error) {
        return handleError(reply, 'ORG_FULL_FETCH_FAILED', error);
      }
    }
  );

  /**
   * Update organization status (admin)
   */
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'active' | 'trialing' | 'suspended' };
  }>(
    '/admin/organizations/:id/status',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:organizations')],
      schema: {
        description: 'Update organization status (admin only).',
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
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'trialing', 'suspended'] },
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
                  status: { type: 'string' },
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
        const { data: org, error } = await supabase
          .from('organizations')
          .update({ status: request.body.status })
          .eq('id', request.params.id)
          .select('id, status')
          .single();

        if (error || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        return { organization: org };
      } catch (error) {
        return handleError(reply, 'ORG_UPDATE_FAILED', error);
      }
    }
  );

  /**
   * Get impersonation token for an organization
   */
  fastify.post<{
    Params: { orgId: string };
  }>(
    '/admin/impersonate/:orgId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('impersonate:organizations')],
      schema: {
        description: 'Get impersonation token to act as an organization (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'JWT token to use for impersonation' },
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
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', request.params.orgId)
          .single();

        if (orgError || !org) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }

        // TODO: Replace with proper JWT with expiry/signature for production
        const token = btoa(`impersonate:${request.params.orgId}:${Date.now()}`);

        return { token };
      } catch (error) {
        return handleError(reply, 'IMPERSONATION_FAILED', error);
      }
    }
  );

  // ==================== Organization Orders ====================

  /**
   * List all orders for an organization with line items
   */
  fastify.get<{
    Params: { orgId: string };
  }>(
    '/admin/organizations/:orgId/orders',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'List all orders for an organization with line items (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              orders: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string' },
                    created_at: { type: 'string' },
                    cart_snapshot: { type: 'object' },
                    line_items: { type: 'array' },
                    invoice_id: { type: 'string', format: 'uuid', nullable: true },
                    payment_id: { type: 'string', format: 'uuid', nullable: true },
                    receipt_url: { type: 'string', nullable: true },
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
    async (request, reply) => {
      try {
        const orders = await getOrders(request.params.orgId);
        return { orders };
      } catch (error) {
        return handleError(reply, 'ORDERS_FETCH_FAILED', error);
      }
    }
  );

  // ==================== Organization Subscriptions ====================

  /**
   * List all subscriptions for an organization
   */
  fastify.get<{
    Params: { orgId: string };
  }>(
    '/admin/organizations/:orgId/subscriptions',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'List all subscriptions for an organization with items and next billing dates (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              subscriptions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    order_id: { type: 'string', format: 'uuid' },
                    domain_id: { type: 'string', format: 'uuid', nullable: true },
                    status: { type: 'string' },
                    billing_anchor_day: { type: 'number' },
                    next_billing_date: { type: 'string' },
                    created_at: { type: 'string' },
                    cancelled_at: { type: 'string', nullable: true },
                    domain: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        domain: { type: 'string' },
                      },
                    },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          code: { type: 'string' },
                          quantity: { type: 'number' },
                          unit_price_cents: { type: 'number' },
                        },
                      },
                    },
                    monthly_amount_cents: { type: 'number' },
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
    async (request, reply) => {
      try {
        const { data: subscriptions, error } = await supabase
          .from('subscriptions')
          .select(`
            *,
            domains(domain),
            subscription_items(id, code, quantity, unit_price_cents)
          `)
          .eq('organization_id', request.params.orgId)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        const transformedSubscriptions = (subscriptions || []).map((sub: any) => {
          const items = sub.subscription_items || [];
          const monthlyAmount = items.reduce(
            (sum: number, item: any) => sum + item.quantity * item.unit_price_cents,
            0
          );

          return {
            id: sub.id,
            organization_id: sub.organization_id,
            order_id: sub.order_id,
            domain_id: sub.domain_id,
            status: sub.status,
            billing_anchor_day: sub.billing_anchor_day,
            next_billing_date: sub.next_billing_date,
            created_at: sub.created_at,
            cancelled_at: sub.cancelled_at,
            domain: sub.domains,
            items: items,
            monthly_amount_cents: monthlyAmount,
          };
        });

        return { subscriptions: transformedSubscriptions };
      } catch (error) {
        return handleError(reply, 'SUBSCRIPTIONS_FETCH_FAILED', error);
      }
    }
  );

  // ==================== Organization Payments ====================

  /**
   * List all payments for an organization
   */
  fastify.get<{
    Params: { orgId: string };
  }>(
    '/admin/organizations/:orgId/payments',
    {
      preHandler: [internalAuthMiddleware, requirePermission('view:organizations')],
      schema: {
        description: 'List all payments for an organization with status and receipt URLs (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    organization_id: { type: 'string', format: 'uuid' },
                    order_id: { type: 'string', format: 'uuid', nullable: true },
                    invoice_id: { type: 'string', format: 'uuid', nullable: true },
                    amount_cents: { type: 'number' },
                    currency: { type: 'string' },
                    status: { type: 'string' },
                    stripe_payment_intent_id: { type: 'string', nullable: true },
                    stripe_charge_id: { type: 'string', nullable: true },
                    receipt_url: { type: 'string', nullable: true },
                    processed_at: { type: 'string' },
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
    async (request, reply) => {
      try {
        const { data: payments, error } = await supabase
          .from('payments')
          .select('*')
          .eq('organization_id', request.params.orgId)
          .order('processed_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        return { payments: payments || [] };
      } catch (error) {
        return handleError(reply, 'PAYMENTS_FETCH_FAILED', error);
      }
    }
  );

  // ==================== Member Management ====================

  /**
   * Invite a new member to an organization
   */
  fastify.post<{
    Params: { orgId: string };
    Body: {
      email: string;
      role: 'owner' | 'admin' | 'member';
    };
  }>(
    '/admin/organizations/:orgId/members',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:organizations')],
      schema: {
        description: 'Invite a new member to an organization (admin only).',
        tags: ['admin'],
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
          required: ['email', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['owner', 'admin', 'member'] },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              member: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'string', format: 'uuid' },
                  role: { type: 'string' },
                },
              },
              created_user: { type: 'boolean' },
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
        const { orgId } = request.params;
        const { email, role } = request.body;

        let userId: string;
        let createdUser = false;

        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .single();

        if (existingUser) {
          userId = existingUser.id;

          const { data: existingMember } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', orgId)
            .eq('user_id', userId)
            .single();

          if (existingMember) {
            return reply.code(400).send({
              error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this organization' },
            });
          }
        } else {
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            email_confirm: false,
          });

          if (authError || !authUser.user) {
            throw new Error(authError?.message || 'Failed to create user');
          }

          userId = authUser.user.id;

          const { error: userError } = await supabase.from('users').insert({
            id: userId,
            email,
          });

          if (userError) {
            await supabase.auth.admin.deleteUser(userId);
            throw new Error(userError.message);
          }

          createdUser = true;

          await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email,
          });
        }

        const { data: member, error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: orgId,
            user_id: userId,
            role,
          })
          .select()
          .single();

        if (memberError || !member) {
          throw new Error(memberError?.message || 'Failed to add member');
        }

        return reply.code(201).send({
          member,
          created_user: createdUser,
        });
      } catch (error) {
        return handleError(reply, 'INVITE_FAILED', error);
      }
    }
  );

  /**
   * Update a member's role
   */
  fastify.patch<{
    Params: { orgId: string; memberId: string };
    Body: {
      role: 'owner' | 'admin' | 'member';
    };
  }>(
    '/admin/organizations/:orgId/members/:memberId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:organizations')],
      schema: {
        description: 'Update a member role in an organization (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'memberId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            memberId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: {
            role: { type: 'string', enum: ['owner', 'admin', 'member'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              member: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  organization_id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'string', format: 'uuid' },
                  role: { type: 'string' },
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
        const { orgId, memberId } = request.params;
        const { role } = request.body;

        const { data: member, error } = await supabase
          .from('organization_members')
          .update({ role })
          .eq('id', memberId)
          .eq('organization_id', orgId)
          .select()
          .single();

        if (error || !member) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Member not found' } });
        }

        return { member };
      } catch (error) {
        return handleError(reply, 'UPDATE_FAILED', error);
      }
    }
  );

  /**
   * Remove a member from an organization
   */
  fastify.delete<{
    Params: { orgId: string; memberId: string };
  }>(
    '/admin/organizations/:orgId/members/:memberId',
    {
      preHandler: [internalAuthMiddleware, requirePermission('manage:organizations')],
      schema: {
        description: 'Remove a member from an organization (admin only).',
        tags: ['admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['orgId', 'memberId'],
          properties: {
            orgId: { type: 'string', format: 'uuid' },
            memberId: { type: 'string', format: 'uuid' },
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
        const { orgId, memberId } = request.params;

        const { data: member } = await supabase
          .from('organization_members')
          .select('role')
          .eq('id', memberId)
          .eq('organization_id', orgId)
          .single();

        if (!member) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Member not found' } });
        }

        if (member.role === 'owner') {
          const { count } = await supabase
            .from('organization_members')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('role', 'owner')
            .neq('id', memberId);

          if (!count || count === 0) {
            return reply.code(400).send({
              error: { code: 'LAST_OWNER', message: 'Cannot remove the last owner of an organization' },
            });
          }
        }

        const { error } = await supabase
          .from('organization_members')
          .delete()
          .eq('id', memberId)
          .eq('organization_id', orgId);

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (error) {
        return handleError(reply, 'REMOVE_FAILED', error);
      }
    }
  );
}

