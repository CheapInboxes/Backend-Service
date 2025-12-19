// EmailBison client for email sending platform integration
// API Docs: https://docs.emailbison.com/

import { SendingPlatformClient, MailboxData, ValidationResult } from './interface.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Build the API URL from user's base URL
// Handles various inputs: inbox.coldmessage.io, inbox.coldmessage.io/, inbox.coldmessage.io/whatever, https://inbox.coldmessage.io/api
function getApiUrl(baseUrl: string): string {
  let cleanUrl = baseUrl.trim();
  
  // Add https:// if no protocol specified
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }
  
  // Parse as URL to extract just the origin (protocol + host)
  try {
    const parsed = new URL(cleanUrl);
    return `${parsed.origin}/api`;
  } catch {
    // Fallback: just strip paths and trailing slashes manually
    cleanUrl = cleanUrl.replace(/\/+$/, '').replace(/\/.*$/, '');
    return `${cleanUrl}/api`;
  }
}

class EmailBisonClient implements SendingPlatformClient {
  async validateApiKey(apiKey: string, baseUrl?: string): Promise<ValidationResult> {
    if (!baseUrl) {
      console.log('[EmailBison] No base URL provided, cannot validate');
      return { valid: false, error: 'No base URL provided. EmailBison requires a custom instance URL.' };
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
      
      if (response.ok) {
        return { valid: true };
      }
      
      // Try to get error message from response
      try {
        const data = await response.json() as { data?: { message?: string } };
        const errorMessage = data?.data?.message || `API returned status ${response.status}`;
        console.log(`[EmailBison] Validation failed: ${errorMessage}`);
        return { valid: false, error: errorMessage };
      } catch {
        return { valid: false, error: `API returned status ${response.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
      console.error('[EmailBison] Validation error:', errorMessage);
      return { valid: false, error: `Network error: ${errorMessage}` };
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

