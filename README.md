# Backend Service

Central API and service layer for CheapInboxes. Handles all business logic, external integrations, and exposes endpoints for both customer and admin frontends.

## Architecture

```
src/
├── index.ts              # Fastify server setup and route registration
├── config/               # Environment configuration
├── middleware/           # Auth, error handling, internal auth
├── routes/               # API route handlers
│   ├── admin.ts          # Admin-only endpoints (billing, orgs, users)
│   ├── auth.ts           # Authentication endpoints
│   ├── billing.ts        # Customer billing endpoints
│   ├── domains.ts        # Domain management
│   ├── health.ts         # Health check
│   ├── mailboxes.ts      # Mailbox provisioning
│   ├── namecheap-import.ts   # Namecheap domain import flow
│   ├── orgs.ts           # Organization management
│   ├── resellerclub/     # ResellerClub integration
│   ├── usage.ts          # Usage event tracking
│   └── webhooks.ts       # Stripe webhooks
├── services/             # Business logic layer
│   ├── authService.ts
│   ├── billingService.ts
│   ├── domainService.ts
│   ├── internalAuthService.ts
│   ├── mailboxService.ts
│   ├── orgService.ts
│   ├── runService.ts
│   └── usageService.ts
├── clients/              # External service integrations
│   ├── automation/       # Automation service client
│   ├── dns/              # Cloudflare DNS
│   ├── domain-registrars/# Namecheap, ResellerClub
│   ├── infrastructure/   # Stripe, Supabase
│   ├── mailbox-providers/# MYP/Google Workspace
│   └── sending-platforms/# Instantly
└── types/                # TypeScript type definitions
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with required variables:
```bash
# Server
PORT=4000

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# ResellerClub (optional)
RESELLERCLUB_AUTH_USERID=your_reseller_id
RESELLERCLUB_API_KEY=your_api_key
RESELLERCLUB_SANDBOX=true

# Automation Service
AUTOMATION_SERVICE_URL=http://localhost:4001
```

3. Run development server:
```bash
npm run dev
```

Server starts at `http://localhost:4000`.

## API Documentation

Interactive docs available at `http://localhost:4000/api/docs` (requires authentication).

## API Endpoints

### Health
- `GET /health` - Health check

### Authentication
- `POST /auth/signup` - Create user account
- `POST /auth/login` - Sign in
- `POST /auth/logout` - Sign out (requires auth)
- `GET /me` - Get current user (requires auth)

### Organizations
- `POST /orgs` - Create organization
- `GET /orgs` - List user's organizations
- `GET /orgs/:orgId` - Get organization details

### Domains
- `POST /orgs/:orgId/domains` - Create domain
- `GET /orgs/:orgId/domains` - List domains
- `GET /orgs/:orgId/domains/:domainId` - Get domain details
- `GET /orgs/:orgId/domains/:domainId/runs` - Get provisioning runs

### Mailboxes
- `POST /orgs/:orgId/domains/:domainId/mailboxes` - Create mailboxes
- `GET /orgs/:orgId/mailboxes` - List mailboxes
- `GET /orgs/:orgId/mailboxes/:mailboxId` - Get mailbox details
- `PATCH /orgs/:orgId/mailboxes/:mailboxId` - Update mailbox

### Billing (Customer)
- `GET /orgs/:orgId/billing/usage` - Usage summary for billing period
- `GET /orgs/:orgId/billing/invoices` - List invoices
- `GET /orgs/:orgId/billing/invoices/:invoiceId` - Invoice details with line items
- `GET /orgs/:orgId/billing/payments` - Payment history
- `POST /orgs/:orgId/billing/checkout` - Create Stripe Checkout session
- `GET /orgs/:orgId/billing/payment-methods` - List saved payment methods
- `DELETE /orgs/:orgId/billing/payment-methods/:id` - Remove payment method

### Usage Events
- `POST /orgs/:orgId/usage-events` - Create usage event
- `GET /orgs/:orgId/usage-events` - List usage events

### Namecheap Import
- `POST /orgs/:orgId/namecheap/connect` - Start Namecheap login flow
- `GET /orgs/:orgId/namecheap/:sessionId/status` - Poll session status
- `POST /orgs/:orgId/namecheap/:sessionId/verify` - Submit 2FA code
- `GET /orgs/:orgId/namecheap/:sessionId/domains` - Get domains from session
- `POST /orgs/:orgId/namecheap/:sessionId/set-nameservers` - Update nameservers

### ResellerClub Integration
- `POST /resellerclub/domains/search` - Check domain availability
- `POST /resellerclub/domains/suggest` - Get domain suggestions
- `GET /resellerclub/pricing/reseller` - Get reseller pricing
- `GET /resellerclub/balance` - Get account balance

### Webhooks
- `POST /webhooks/stripe` - Stripe payment events

### Admin Endpoints
All admin endpoints require internal authentication with role-based permissions.

**Pricebook Management**
- `GET /admin/pricebook` - List pricebook items
- `POST /admin/pricebook` - Create pricebook item
- `PATCH /admin/pricebook/:id` - Update pricebook item

**Pricing Rules**
- `GET /admin/pricing-rules` - List pricing rules with conditions
- `POST /admin/pricing-rules` - Create pricing rule
- `PATCH /admin/pricing-rules/:id` - Update pricing rule
- `DELETE /admin/pricing-rules/:id` - Delete pricing rule

**Invoices & Payments**
- `GET /admin/invoices` - List all invoices
- `GET /admin/invoices/:invoiceId` - Get invoice with line items
- `POST /admin/billing/generate-invoices` - Generate invoices for period
- `POST /admin/invoices/:invoiceId/sync` - Sync invoice to Stripe
- `POST /admin/invoices/:invoiceId/pay` - Process payment
- `GET /admin/payments` - List all payments
- `GET /admin/organizations/:orgId/payment-methods` - Get org payment methods
- `POST /admin/organizations/:orgId/charges` - Create manual charge

**Organizations**
- `GET /admin/organizations` - List all organizations
- `GET /admin/organizations/:id` - Get org details with members
- `POST /admin/impersonate/:orgId` - Get impersonation token

**Domains & Mailboxes**
- `GET /admin/domains` - List all domains
- `POST /admin/domains/:id/retry` - Retry domain provisioning
- `GET /admin/mailboxes` - List all mailboxes
- `POST /admin/mailboxes/:id/retry` - Retry mailbox provisioning

**Internal Users**
- `GET /admin/internal-users` - List internal users
- `POST /admin/internal-users` - Create internal user
- `PATCH /admin/internal-users/:id` - Update internal user
- `POST /admin/internal-users/:id/permissions` - Grant permission
- `DELETE /admin/internal-users/:id/permissions/:permission` - Revoke permission

**Audit Log**
- `GET /admin/audit-log` - Query audit log entries

## Authentication

### Customer Authentication
Uses Supabase JWT tokens. Include in Authorization header:
```
Authorization: Bearer <supabase_jwt_token>
```

### Internal/Admin Authentication
Admin endpoints use role-based access control with the following roles:
- `support` - View-only access
- `ops` - Operational access (retry provisioning)
- `billing` - Billing management
- `admin` - Full access
- `founder` - All permissions

## External Integrations

| Integration | Purpose |
|-------------|---------|
| Supabase | Database and user authentication |
| Stripe | Billing and payments |
| Cloudflare | DNS management |
| ResellerClub | Domain registration and pricing |
| Namecheap | Domain import via browser automation |
| MYP/Google Workspace | Mailbox provisioning |
| Instantly | Sending platform integration |

## Scripts

- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Run production build
- `npm run type-check` - TypeScript type checking
