```markdown
# Backend Service – Phase 1: Foundation

Goal: stand up a single Node.js/TypeScript backend that can:
- authenticate requests using Supabase JWTs,
- create/sync users and organizations,
- expose a minimal HTTP API for the two frontends,
- and talk to Supabase using the service-role key.

This phase is **auth + org creation only**, with clean structure for later features.

---

## 1. Tech stack & entrypoint

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **HTTP framework**: Fastify or Express (keep it thin; no heavy framework).
- **Entrypoint**: `src/index.ts`
  - Loads env config.
  - Creates HTTP server.
  - Registers routes from `src/routes/*`.

Env vars (examples):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` (default 4000)

---

## 2. High-level folder structure

- `src/`
  - `index.ts` – bootstrap HTTP server.
  - `config/`
    - `env.ts` – validate and expose env variables.
  - `clients/`
    - `supabase.ts` – Supabase service-role client wrapper.
  - `middleware/`
    - `auth.ts` – verify Supabase JWT, attach `userId` and (later) org/role context.
  - `routes/`
    - `health.ts` – `GET /health` for simple checks.
    - `auth.ts` – login/session validation endpoints (e.g. `GET /me`).
    - `orgs.ts` – org creation and retrieval endpoints.
  - `services/`
    - `authService.ts` – user sync logic (ensure `users` row exists).
    - `orgService.ts` – organization + membership logic.
  - `types/`
    - shared domain types (Org, User, ApiError, etc.).

Later phases will add:
- `services/domainsService.ts`, `services/mailboxesService.ts`, `services/billingService.ts`, etc.
- `routes/domains.ts`, `routes/mailboxes.ts`, `routes/billing.ts`, etc.

---

## 3. Auth & user sync logic

### 3.1 Supabase JWT verification

- Incoming requests from frontends include:
  - `Authorization: Bearer <supabase_jwt>`
- `middleware/auth.ts`:
  - Verifies JWT using Supabase JWKS or Supabase client.
  - Extracts `userId = auth.uid()` and email.
  - On success, attaches `req.user = { id, email }`; on failure, returns 401.

### 3.2 User profile sync

`authService.ts` responsibilities:
- On first authenticated request:
  - Upsert into `users` table:
    - `id = auth.uid()`
    - `email`, `name` (if available)
- Optionally expose `GET /me`:
  - Returns `users` row plus list of organizations (via `organization_members`).

Routes:
- `GET /me` – requires auth; returns `{ user, organizations: [...] }`.

---

## 4. Organization creation & membership

### 4.1 Org creation flow

`orgService.ts` responsibilities:
- `createOrganization({ name, billingEmail }, userId)`:
  - Inserts into `organizations`:
    - `name`, `billing_email`, blank or placeholder `stripe_customer_id`.
  - Inserts into `organization_members`:
    - `organization_id` from above,
    - `user_id = userId`,
    - `role = 'owner'`.
  - Writes an `audit_log` entry (`action = 'org.create'`).
  - Returns the new organization + membership.

### 4.2 Org endpoints

`routes/orgs.ts`:
- `POST /orgs`
  - Auth required.
  - Body: `{ name, billingEmail }`.
  - Calls `orgService.createOrganization(...)`.
  - Returns `{ organization, membership }`.

- `GET /orgs`
  - Auth required.
  - Lists orgs for the current user based on `organization_members`.

- `GET /orgs/:orgId`
  - Auth required.
  - Validates that current user is a member of `orgId` (by querying `organization_members`).
  - Returns organization details and member role (`owner/admin/member`).

RLS in Supabase will additionally enforce membership on direct table reads; backend should still check membership explicitly to provide clear 403 errors.

---

## 5. Error handling & logging

- Central error handler middleware:
  - Normalizes errors to JSON: `{ error: { code, message } }`.
  - Distinguishes between:
    - 400 (validation),
    - 401 (auth),
    - 403 (not a member / insufficient role),
    - 500 (unexpected).

- Logging:
  - Basic request logging (method, path, status, latency).
  - Log auth failures and org creation events (in addition to `audit_log` rows).

---

## 6. Phase 1 Completion Criteria

- Backend service runs locally and exposes:
  - `GET /health`
  - `GET /me` (returns user + org memberships)
  - `POST /orgs` (creates org + owner membership)
  - `GET /orgs`, `GET /orgs/:orgId`
- All above endpoints:
  - verify Supabase JWT,
  - read/write the real Supabase schema,
  - obey RLS (no bypassing with raw SQL outside membership rules).

Once this is stable, Phase 2 will add domain + mailbox flows on top of the same structure.
```


