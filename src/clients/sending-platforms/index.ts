// Sending Platform Clients
// Factory function to get the appropriate client for each platform

import { SendingPlatformClient } from './interface.js';
import { instantlyClient } from './instantly.js';
import { smartleadClient } from './smartlead.js';
import { emailBisonClient } from './emailbison.js';
import { plusVibeClient } from './plusvibe.js';

export type SendingPlatform = 'instantly' | 'smartlead' | 'emailbison' | 'plusvibe';

const clients: Record<SendingPlatform, SendingPlatformClient> = {
  instantly: instantlyClient,
  smartlead: smartleadClient,
  emailbison: emailBisonClient,
  plusvibe: plusVibeClient,
};

export function getSendingPlatformClient(platform: SendingPlatform): SendingPlatformClient {
  const client = clients[platform];
  if (!client) {
    throw new Error(`Unknown sending platform: ${platform}`);
  }
  return client;
}

export { SendingPlatformClient, MailboxData } from './interface.js';

