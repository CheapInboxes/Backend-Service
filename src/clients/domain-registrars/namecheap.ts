// Mock Namecheap client for domain registration

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function registerDomain(domain: string): Promise<{ orderId: string; success: boolean }> {
  console.log(`[MOCK] Namecheap: Registering domain ${domain}`);
  await delay(200 + Math.random() * 300); // 200-500ms delay

  const orderId = `NC-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[MOCK] Namecheap: Domain ${domain} registered successfully with order ID ${orderId}`);

  return {
    orderId,
    success: true,
  };
}

export async function checkAvailability(domain: string): Promise<{ available: boolean }> {
  console.log(`[MOCK] Namecheap: Checking availability for ${domain}`);
  await delay(100 + Math.random() * 200); // 100-300ms delay

  console.log(`[MOCK] Namecheap: Domain ${domain} is available`);
  return {
    available: true,
  };
}

