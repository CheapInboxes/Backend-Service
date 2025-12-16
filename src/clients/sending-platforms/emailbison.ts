// EmailBison client for email sending platform integration
// API Docs: https://docs.emailbison.com/

import { SendingPlatformClient, MailboxData } from './interface.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Build the API URL from user's base URL (e.g., https://yourinstance.emailbison.com -> https://yourinstance.emailbison.com/api)
function getApiUrl(baseUrl: string): string {
  // Remove trailing slash if present
  const cleanUrl = baseUrl.replace(/\/$/, '');
  // Append /api if not already present
  return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
}

class EmailBisonClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string, baseUrl?: string): Promise<boolean> {
    if (!baseUrl) {
      console.log('[EmailBison] No base URL provided, cannot validate');
      return false;
    }
    
    try {
      const apiUrl = getApiUrl(baseUrl);
      // Use the users endpoint to validate the key
      const response = await fetch(`${apiUrl}/users`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.error('[EmailBison] Validation error:', error);
      return false;
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData, _baseUrl?: string): Promise<{ externalId: string }> {
    console.log(`[EmailBison] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response for now - actual implementation would POST to /api/accounts
    const externalId = `emailbison-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, externalId: string, _baseUrl?: string): Promise<void> {
    console.log(`[EmailBison] Removing mailbox: ${externalId}`);
    await delay(100 + Math.random() * 200);
  }

  async listMailboxes(apiKey: string, baseUrl?: string): Promise<MailboxData[]> {
    if (!baseUrl) {
      console.log('[EmailBison] No base URL provided, cannot list mailboxes');
      return [];
    }
    
    try {
      const apiUrl = getApiUrl(baseUrl);
      const response = await fetch(`${apiUrl}/accounts`, {
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

