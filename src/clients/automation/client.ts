import { env } from '../../config/env.js';

// Types matching Automation-Service responses
export interface NamecheapDomain {
  name: string;
  status: string;
  expiry: string;
}

export interface NamecheapConnectResponse {
  success: boolean;
  sessionId: string;
  jobId?: string;
}

export interface NamecheapStatusResponse {
  status: 'connecting' | 'needs_code' | 'verifying' | 'success' | 'failed' | 'updating_ns' | 'ns_updated';
  domains?: NamecheapDomain[];
  error?: string;
  updatedAt?: string;
}

export interface NamecheapVerifyResponse {
  success: boolean;
  message: string;
}

export interface NamecheapSetNameserversResponse {
  success: boolean;
  jobId?: string;
  message: string;
}

export interface NamecheapDomainsResponse {
  domains: NamecheapDomain[];
}

class AutomationClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.AUTOMATION_SERVICE_URL;
    this.apiKey = env.AUTOMATION_SERVICE_API_KEY;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      const error = new Error(errorData.error || `Request failed: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    return response.json() as Promise<T>;
  }

  // Namecheap endpoints
  namecheap = {
    connect: (username: string, password: string, organizationId: string): Promise<NamecheapConnectResponse> => {
      return this.request('/api/namecheap/connect', {
        method: 'POST',
        body: JSON.stringify({ username, password, organizationId }),
      });
    },

    getStatus: (sessionId: string): Promise<NamecheapStatusResponse> => {
      return this.request(`/api/namecheap/${sessionId}/status`);
    },

    verify: (sessionId: string, code: string): Promise<NamecheapVerifyResponse> => {
      return this.request(`/api/namecheap/${sessionId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },

    getDomains: (sessionId: string): Promise<NamecheapDomainsResponse> => {
      return this.request(`/api/namecheap/${sessionId}/domains`);
    },

    setNameservers: (
      sessionId: string,
      domains: string[],
      nameservers: string[]
    ): Promise<NamecheapSetNameserversResponse> => {
      return this.request(`/api/namecheap/${sessionId}/set-nameservers`, {
        method: 'POST',
        body: JSON.stringify({ domains, nameservers }),
      });
    },
  };
}

export const automationClient = new AutomationClient();

