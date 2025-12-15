# Backend Service – API + Service Layer

This folder contains the **single backend service** that:
- exposes an HTTP API to both frontends, and
- is the only component that talks to Supabase and external providers.

## Responsibilities
- Authentication and authorization for all API calls using:
  - Supabase JWTs from end users,
  - internal admin/staff roles for the admin app.
- Core domain logic:
  - Organizations, users, and memberships,
  - Domain import/purchase flows,
  - Mailbox provisioning flows (MYP),
  - Registration of mailboxes with sending providers (e.g. Instantly),
  - Emitting `usage_events` and generating `invoice_items`/`invoices`,
  - Writing `audit_log` entries.
- Integration clients for:
  - Registrars (e.g. ResellerClub / Namecheap),
  - DNS (Cloudflare),
  - MYP / Google Workspace,
  - Sending providers (Instantly),
  - Stripe (billing).
- Background jobs / workers (either as a separate process in the same codebase or as cron-triggered tasks) for:
  - Monthly billing runs,
  - Domain renewal checks,
  - Periodic health checks.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Fill in your Supabase credentials in `.env`:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (from Supabase dashboard)
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key (from Supabase dashboard → Settings → API)

4. Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:4000` (or the PORT specified in `.env`).

## Available Endpoints

### Health
- `GET /health` - Health check endpoint

### Documentation
- `GET /api/docs` - Interactive API documentation (Scalar)

### Authentication
- `POST /auth/signup` - Create a new user account
- `POST /auth/login` - Sign in with email and password
- `POST /auth/logout` - Sign out the current user (requires auth)
- `GET /me` - Get current user and their organizations (requires auth)

### Organizations
- `POST /orgs` - Create a new organization (requires auth)
- `GET /orgs` - List user's organizations (requires auth)
- `GET /orgs/:orgId` - Get organization details (requires auth + membership)

### Domains
- `POST /orgs/:orgId/domains` - Create domain with auto-provisioning (requires auth + membership)
- `GET /orgs/:orgId/domains` - List domains with filtering (requires auth + membership)
- `GET /orgs/:orgId/domains/:domainId` - Get domain details (requires auth + membership)
- `GET /orgs/:orgId/domains/:domainId/runs` - Get domain runs history (requires auth + membership)

### Mailboxes
- `POST /orgs/:orgId/domains/:domainId/mailboxes` - Create mailboxes (requires auth + membership)
- `GET /orgs/:orgId/mailboxes` - List mailboxes with filtering (requires auth + membership)
- `GET /orgs/:orgId/mailboxes/:mailboxId` - Get mailbox details (requires auth + membership)
- `PATCH /orgs/:orgId/mailboxes/:mailboxId` - Update mailbox status (requires auth + membership)

### Usage Events (Billing)
- `POST /orgs/:orgId/usage-events` - Create manual usage event (requires auth + membership)
- `GET /orgs/:orgId/usage-events` - List usage events with filtering (requires auth + membership)
- `GET /orgs/:orgId/usage-events/:eventId` - Get usage event details (requires auth + membership)

**Note:** Usage events are automatically created when domains and mailboxes are provisioned.

## Authentication

All endpoints except `/health`, `/api/docs`, `/auth/signup`, and `/auth/login` require a Supabase JWT token in the `Authorization` header:
```
Authorization: Bearer <supabase_jwt_token>
```

The backend provides authentication endpoints for user signup and login:

- **`POST /auth/signup`**: Create a new user account with email and password
  - Returns user info and JWT tokens (access_token, refresh_token)
  - Automatically syncs user to the `users` table
  
- **`POST /auth/login`**: Sign in with email and password
  - Returns user info and JWT tokens
  - Automatically syncs user to the `users` table if they don't exist yet

- **`POST /auth/logout`**: Sign out the current user
  - Requires valid JWT token in Authorization header

After signup or login, use the `access_token` in the `Authorization: Bearer <token>` header for authenticated endpoints.

## API Documentation

Visit `http://localhost:4000/api/docs` in your browser to access the interactive API documentation with:
- Beautiful modern interface powered by Scalar
- All available endpoints with full OpenAPI 3.0 specification
- Try-it-out functionality to test endpoints directly
- Request/response schemas and examples
- Authentication configuration (Bearer token)
- Code examples in multiple languages

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Run production build
- `npm run type-check` - Type check without building

## Non-goals
- No UI or templating; this is purely an API and job runner.
- No direct access from the browser; all calls come via the two frontends or internal tooling.
