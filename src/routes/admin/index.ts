import { FastifyInstance } from 'fastify';
import { pricebookRoutes } from './pricebook.js';
import { billingRoutes } from './billing.js';
import { organizationsRoutes } from './organizations.js';
import { domainsRoutes } from './domains.js';
import { mailboxesRoutes } from './mailboxes.js';
import { internalUsersRoutes } from './internal-users.js';
import { integrationsRoutes } from './integrations.js';
import { usageRoutes } from './usage.js';
import { auditRoutes } from './audit.js';

/**
 * Register all admin routes
 */
export async function adminRoutes(fastify: FastifyInstance) {
  await pricebookRoutes(fastify);
  await billingRoutes(fastify);
  await organizationsRoutes(fastify);
  await domainsRoutes(fastify);
  await mailboxesRoutes(fastify);
  await internalUsersRoutes(fastify);
  await integrationsRoutes(fastify);
  await usageRoutes(fastify);
  await auditRoutes(fastify);
}

// Re-export for convenience
export { pricebookRoutes } from './pricebook.js';
export { billingRoutes } from './billing.js';
export { organizationsRoutes } from './organizations.js';
export { domainsRoutes } from './domains.js';
export { mailboxesRoutes } from './mailboxes.js';
export { internalUsersRoutes } from './internal-users.js';
export { integrationsRoutes } from './integrations.js';
export { usageRoutes } from './usage.js';
export { auditRoutes } from './audit.js';

