// PlusVibe client for email sending platform integration

import { SendingPlatformClient, MailboxData, ValidationResult } from './interface.js';

const PLUSVIBE_API_BASE = 'https://api.plusvibe.ai/v1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PlusVibeClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string, _baseUrl?: string): Promise<ValidationResult> {
    try {
      // Validate key with a simple API call
      const response = await fetch(`${PLUSVIBE_API_BASE}/email-accounts`, {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        return { valid: true };
      }
      
      // Try to get error message from response
      try {
        const data = await response.json() as { message?: string; error?: string };
        const errorMessage = data?.message || data?.error || `API returned status ${response.status}`;
        console.log(`[PlusVibe] Validation failed: ${errorMessage}`);
        return { valid: false, error: errorMessage };
      } catch {
        return { valid: false, error: `API returned status ${response.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
      console.error('[PlusVibe] Validation error:', errorMessage);
      return { valid: false, error: `Network error: ${errorMessage}` };
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData, _baseUrl?: string): Promise<{ externalId: string }> {
    console.log(`[PlusVibe] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response for now
    const externalId = `plusvibe-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, _externalId: string, _baseUrl?: string): Promise<void> {
    console.log(`[PlusVibe] Removing mailbox: ${_externalId}`);
    await delay(100 + Math.random() * 200);
  }

  async listMailboxes(apiKey: string, _baseUrl?: string): Promise<MailboxData[]> {
    try {
      const response = await fetch(`${PLUSVIBE_API_BASE}/email-accounts`, {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`PlusVibe API error: ${response.status}`);
      }

      const data = await response.json() as { accounts?: any[] };
      
      return (data.accounts || []).map((account: any) => ({
        email: account.email,
        firstName: account.first_name || '',
        lastName: account.last_name || '',
      }));
    } catch (error) {
      console.error('[PlusVibe] Failed to list mailboxes:', error);
      return [];
    }
  }
}

export const plusVibeClient = new PlusVibeClient();

