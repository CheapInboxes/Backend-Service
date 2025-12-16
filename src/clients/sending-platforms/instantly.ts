// Instantly.ai client for email sending platform integration
// API Docs: https://developer.instantly.ai/

import { SendingPlatformClient, MailboxData } from './interface.js';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class InstantlyClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string, _baseUrl?: string): Promise<boolean> {
    try {
      // Use the accounts endpoint to validate the key (API V2 uses Bearer auth)
      const response = await fetch(`${INSTANTLY_API_BASE}/accounts?limit=1`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData, _baseUrl?: string): Promise<{ externalId: string }> {
    // Instantly uses email as the unique identifier
    // In production, you would call the accounts endpoint
    // For now, we'll mock this as Instantly requires SMTP credentials
    
    console.log(`[Instantly] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response - in production this would be the real API call
    // POST https://api.instantly.ai/api/v2/accounts
    // Headers: Authorization: Bearer API_KEY
    
    const externalId = `instantly-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, _externalId: string, _baseUrl?: string): Promise<void> {
    console.log(`[Instantly] Removing mailbox: ${_externalId}`);
    await delay(100 + Math.random() * 200);
    
    // In production: DELETE to accounts endpoint
    // DELETE https://api.instantly.ai/api/v2/accounts/{id}
  }

  async listMailboxes(apiKey: string, _baseUrl?: string): Promise<MailboxData[]> {
    try {
      const response = await fetch(`${INSTANTLY_API_BASE}/accounts?limit=100`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Instantly API error: ${response.status}`);
      }

      const data = await response.json() as { items?: any[] };
      
      // Map Instantly response to our MailboxData format
      return (data.items || []).map((account: any) => ({
        email: account.email,
        firstName: account.first_name || '',
        lastName: account.last_name || '',
      }));
    } catch (error) {
      console.error('[Instantly] Failed to list mailboxes:', error);
      return [];
    }
  }
}

export const instantlyClient = new InstantlyClient();

// Legacy function for backward compatibility with mailboxService
// TODO: Remove once mailbox provisioning is fully migrated to org-level integrations
export async function addAccount(email: string, _domain: string): Promise<{ accountId: string }> {
  console.log(`[Instantly] Legacy addAccount called for: ${email}`);
  await delay(100 + Math.random() * 200);
  
  // Mock response - in production this would use the system-level API key
  const accountId = `instantly-legacy-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  return { accountId };
}
