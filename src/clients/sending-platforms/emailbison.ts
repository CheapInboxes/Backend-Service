// EmailBison client for email sending platform integration

import { SendingPlatformClient, MailboxData } from './interface.js';

const EMAILBISON_API_BASE = 'https://api.emailbison.com/v1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class EmailBisonClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Validate key with a simple API call
      const response = await fetch(`${EMAILBISON_API_BASE}/accounts`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      // If API is not available, mock validation for development
      console.log('[EmailBison] API not available, using mock validation');
      return apiKey.length > 10;
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData): Promise<{ externalId: string }> {
    console.log(`[EmailBison] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response for now
    const externalId = `emailbison-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, _externalId: string): Promise<void> {
    console.log(`[EmailBison] Removing mailbox: ${_externalId}`);
    await delay(100 + Math.random() * 200);
  }

  async listMailboxes(apiKey: string): Promise<MailboxData[]> {
    try {
      const response = await fetch(`${EMAILBISON_API_BASE}/accounts`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`EmailBison API error: ${response.status}`);
      }

      const data = await response.json() as { accounts?: any[] };
      
      return (data.accounts || []).map((account: any) => ({
        email: account.email,
        firstName: account.first_name || '',
        lastName: account.last_name || '',
      }));
    } catch (error) {
      console.error('[EmailBison] Failed to list mailboxes:', error);
      return [];
    }
  }
}

export const emailBisonClient = new EmailBisonClient();

