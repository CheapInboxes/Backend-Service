// Mock Instantly.ai client for email sending platform integration

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function addAccount(email: string, domain: string): Promise<{ accountId: string }> {
  console.log(`[MOCK] Instantly: Adding account ${email} for domain ${domain}`);
  await delay(150 + Math.random() * 250); // 150-400ms delay

  const accountId = `instantly-acc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[MOCK] Instantly: Account ${email} added with ID ${accountId}`);

  return {
    accountId,
  };
}







