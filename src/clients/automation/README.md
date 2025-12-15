# Automation Client

Internal Automation-Service with Playwright-backed endpoints for browser automation.

## Endpoints

### Namecheap Import
- `POST /api/namecheap/connect` - Start Namecheap login flow
- `GET /api/namecheap/:sessionId/status` - Get session status (poll for updates)
- `POST /api/namecheap/:sessionId/verify` - Submit 2FA verification code
- `GET /api/namecheap/:sessionId/domains` - Get domains after successful login
- `POST /api/namecheap/:sessionId/set-nameservers` - Update nameservers for domains

## Usage

```typescript
import { automationClient } from './client';

// Start connection
const { sessionId } = await automationClient.namecheap.connect(username, password, orgId);

// Poll for status
const { status, domains, error } = await automationClient.namecheap.getStatus(sessionId);

// Submit 2FA code if needed
if (status === 'needs_code') {
  await automationClient.namecheap.verify(sessionId, code);
}

// Set nameservers on success
if (status === 'success') {
  await automationClient.namecheap.setNameservers(sessionId, ['domain.com'], ['ns1.cloudflare.com', 'ns2.cloudflare.com']);
}
```

## Configuration

Requires environment variables:
- `AUTOMATION_SERVICE_URL` - URL of Automation-Service (default: http://localhost:3002)
- `AUTOMATION_API_KEY` - API key for authentication (must match INTERNAL_API_KEY in Automation-Service)

