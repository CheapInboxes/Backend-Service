// Smartlead.ai client for email sending platform integration
// API Docs: https://api.smartlead.ai/docs

import { SendingPlatformClient, MailboxData } from './interface.js';

const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SmartleadClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string, _baseUrl?: string): Promise<boolean> {
    try {
      // Use a simple endpoint to validate the key
      const response = await fetch(`${SMARTLEAD_API_BASE}/email-accounts?api_key=${apiKey}&limit=1`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async addMailbox(_apiKey: string, mailbox: MailboxData, _baseUrl?: string): Promise<{ externalId: string }> {
    console.log(`[Smartlead] Adding mailbox: ${mailbox.email}`);
    await delay(100 + Math.random() * 200);

    // Mock response - in production this would be:
    // POST https://server.smartlead.ai/api/v1/email-accounts/save
    // Body: { api_key, from_name, from_email, ... }
    
    const externalId = `smartlead-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return { externalId };
  }

  async removeMailbox(_apiKey: string, _externalId: string, _baseUrl?: string): Promise<void> {
    console.log(`[Smartlead] Removing mailbox: ${_externalId}`);
    await delay(100 + Math.random() * 200);
    
    // In production: DELETE to email-accounts endpoint
    // DELETE https://server.smartlead.ai/api/v1/email-accounts/{id}
  }

  async listMailboxes(apiKey: string, _baseUrl?: string): Promise<MailboxData[]> {
    try {
      const response = await fetch(`${SMARTLEAD_API_BASE}/email-accounts?api_key=${apiKey}&limit=100`);
      
      if (!response.ok) {
        throw new Error(`Smartlead API error: ${response.status}`);
      }

      const data = await response.json() as any[];
      
      // Map Smartlead response to our MailboxData format
      return (data || []).map((account: any) => ({
        email: account.from_email,
        firstName: account.from_name?.split(' ')[0] || '',
        lastName: account.from_name?.split(' ').slice(1).join(' ') || '',
      }));
    } catch (error) {
      console.error('[Smartlead] Failed to list mailboxes:', error);
      return [];
    }
  }
}

export const smartleadClient = new SmartleadClient();

