// PlusVibe client for email sending platform integration

import { SendingPlatformClient, MailboxData } from './interface.js';

const PLUSVIBE_API_BASE = 'https://api.plusvibe.com/v1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PlusVibeClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Validate key with a simple API call
      const response = await fetch(`${PLUSVIBE_API_BASE}/email-accounts`, {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      // If API is not available, mock validation for development
      console.log('[PlusVibe] API not available, using mock validation');
      return apiKey.length > 10;
    }
  }

  async addMailbox(apiKey: string, mailbox: MailboxData): Promise<{ externalId: string }> {
    console.log(`[PlusVibe] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response for now
    const externalId = `plusvibe-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(apiKey: string, externalId: string): Promise<void> {
    console.log(`[PlusVibe] Removing mailbox: ${externalId}`);
    await delay(100 + Math.random() * 200);
  }

  async listMailboxes(apiKey: string): Promise<MailboxData[]> {
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

      const data = await response.json();
      
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

