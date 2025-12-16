// Instantly.ai client for email sending platform integration
// API Docs: https://developer.instantly.ai/

import { SendingPlatformClient, MailboxData } from './interface.js';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class InstantlyClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Use the account list endpoint to validate the key
      const response = await fetch(`${INSTANTLY_API_BASE}/account/list?api_key=${apiKey}&limit=1`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData): Promise<{ externalId: string }> {
    // Instantly uses email as the unique identifier
    // In production, you would call the account/add endpoint
    // For now, we'll mock this as Instantly requires SMTP credentials
    
    console.log(`[Instantly] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response - in production this would be the real API call
    // POST https://api.instantly.ai/api/v1/account/add
    // Body: { api_key, email, first_name, last_name, ... }
    
    const externalId = `instantly-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, _externalId: string): Promise<void> {
    console.log(`[Instantly] Removing mailbox: ${_externalId}`);
    await delay(100 + Math.random() * 200);
    
    // In production: DELETE or POST to account/delete endpoint
    // POST https://api.instantly.ai/api/v1/account/delete
    // Body: { api_key, email }
  }

  async listMailboxes(apiKey: string): Promise<MailboxData[]> {
    try {
      const response = await fetch(`${INSTANTLY_API_BASE}/account/list?api_key=${apiKey}&limit=100`);
      
      if (!response.ok) {
        throw new Error(`Instantly API error: ${response.status}`);
      }

      const data = await response.json() as any[];
      
      // Map Instantly response to our MailboxData format
      return (data || []).map((account: any) => ({
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
