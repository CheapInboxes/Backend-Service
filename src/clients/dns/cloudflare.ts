// Mock Cloudflare client for DNS management

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DNSRecord {
  type: string;
  name: string;
  content: string;
  ttl?: number;
}

export async function createZone(domain: string): Promise<{ zoneId: string; nameservers: string[] }> {
  console.log(`[MOCK] Cloudflare: Creating zone for ${domain}`);
  await delay(300 + Math.random() * 400); // 300-700ms delay

  const zoneId = `cf-zone-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const nameservers = [
    `ns1.cloudflare.com`,
    `ns2.cloudflare.com`,
  ];

  console.log(`[MOCK] Cloudflare: Zone created for ${domain} with ID ${zoneId}`);
  return {
    zoneId,
    nameservers,
  };
}

export async function updateDNSRecords(
  zoneId: string,
  _records: DNSRecord[]
): Promise<{ success: boolean }> {
  console.log(`[MOCK] Cloudflare: Updating DNS records for zone ${zoneId}`);
  await delay(150 + Math.random() * 250); // 150-400ms delay

  console.log(`[MOCK] Cloudflare: DNS records updated successfully`);
  return {
    success: true,
  };
}

export async function addNameservers(domain: string): Promise<{ nameservers: string[] }> {
  console.log(`[MOCK] Cloudflare: Adding nameservers for ${domain}`);
  await delay(100 + Math.random() * 200); // 100-300ms delay

  const nameservers = [
    `ns1.cloudflare.com`,
    `ns2.cloudflare.com`,
  ];

  console.log(`[MOCK] Cloudflare: Nameservers configured for ${domain}`);
  return {
    nameservers,
  };
}












