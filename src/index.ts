import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifyApiReference from '@scalar/fastify-api-reference';
import fastifyCors from '@fastify/cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { docsAuthMiddleware } from './middleware/docsAuth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { orgRoutes } from './routes/orgs.js';
import { domainRoutes } from './routes/domains.js';
import { mailboxRoutes } from './routes/mailboxes.js';
import { usageRoutes } from './routes/usage.js';
import { billingRoutes } from './routes/billing.js';
import { adminRoutes } from './routes/admin.js';
import { webhookRoutes } from './routes/webhooks.js';
import { resellerclubRoutes } from './routes/resellerclub/index.js';
import { namecheapImportRoutes } from './routes/namecheap-import.js';
import { orderRoutes } from './routes/orders.js';
import { uploadRoutes } from './routes/uploads.js';
import { integrationRoutes } from './routes/integrations.js';
import { notificationRoutes } from './routes/notifications.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Start server
const start = async () => {
  try {
    // Register CORS (only needed for local dev API docs, server actions don't need CORS)
    await fastify.register(fastifyCors, {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Register Swagger
    await fastify.register(fastifySwagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'CheapInboxes Backend API',
          description: 'API documentation for the CheapInboxes backend service. Users are created via Supabase Auth (not through this API). The backend syncs user profiles automatically on first authenticated request.',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://localhost:${env.PORT}`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Supabase JWT token',
            },
          },
        },
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'auth', description: 'Authentication and user endpoints' },
          { name: 'organizations', description: 'Organization management endpoints' },
          { name: 'domains', description: 'Domain management endpoints' },
          { name: 'mailboxes', description: 'Mailbox management endpoints' },
          { name: 'usage', description: 'Usage events and billing tracking endpoints' },
          { name: 'billing', description: 'Billing, invoices, and payment endpoints' },
          { name: 'admin', description: 'Admin-only endpoints for managing billing' },
          { name: 'webhooks', description: 'Webhook endpoints for external services' },
          { name: 'resellerclub', description: 'ResellerClub domain registrar integration endpoints' },
          { name: 'orders', description: 'Order checkout and configuration endpoints' },
          { name: 'uploads', description: 'File upload endpoints' },
          { name: 'integrations', description: 'Sending platform integration endpoints' },
          { name: 'notifications', description: 'Email notification endpoints (admin)' },
        ],
      },
    });

    // Register API documentation with authentication
    await fastify.register(
      async (instance) => {
        // Apply auth middleware to all routes in this scope
        instance.addHook('onRequest', docsAuthMiddleware);

        // Register the API reference docs
        await instance.register(fastifyApiReference, {
          routePrefix: '/api/docs',
          configuration: {
            expandAllModelSections: true,
            expandAllResponses: true,
            hideClientButton: false,
            showSidebar: true,
            showDeveloperTools: "localhost",
            showToolbar: "localhost",
            operationTitleSource: "summary",
            theme: "purple",
            persistAuth: false,
            telemetry: true,
            layout: "modern",
            isEditable: false,
            isLoading: false,
            hideModels: false,
            documentDownloadType: "both",
            hideTestRequestButton: false,
            hideSearch: false,
            showOperationId: false,
            hideDarkModeToggle: false,
            withDefaultFonts: true,
            defaultOpenAllTags: false,
            orderSchemaPropertiesBy: "alpha",
            orderRequiredPropertiesFirst: true,
            _integration: "fastify",
            defaultHttpClient: {
              targetKey: "shell",
              clientKey: "curl",
            },
            default: false,
            slug: "api-1",
            title: "API #1",
          },
        });
      }
    );

    // Register error handler
    fastify.setErrorHandler(errorHandler);

    // Register shared schemas
    fastify.addSchema({
      $id: 'ApiError',
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
    });

    // Register routes
    await fastify.register(healthRoutes);
    await fastify.register(authRoutes);
    await fastify.register(orgRoutes);
    await fastify.register(domainRoutes);
    await fastify.register(mailboxRoutes);
    await fastify.register(usageRoutes);
    await fastify.register(billingRoutes);
    await fastify.register(adminRoutes);
    await fastify.register(webhookRoutes);
    await fastify.register(resellerclubRoutes);
    await fastify.register(namecheapImportRoutes);
    await fastify.register(orderRoutes);
    await fastify.register(uploadRoutes);
    await fastify.register(integrationRoutes);
    await fastify.register(notificationRoutes);

    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`📚 API Documentation available at http://localhost:${env.PORT}/api/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

