// Mock MailYourProspects (MYP) client for mailbox provisioning

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createOrganization(domain: string): Promise<{ orgId: string }> {
  console.log(`[MOCK] MYP: Creating organization for domain ${domain}`);
  await delay(250 + Math.random() * 350); // 250-600ms delay

  const orgId = `myp-org-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[MOCK] MYP: Organization created for ${domain} with ID ${orgId}`);

  return {
    orgId,
  };
}

export async function createMailbox(
  orgId: string,
  email: string,
  _firstName: string,
  _lastName: string
): Promise<{ userId: string }> {
  console.log(`[MOCK] MYP: Creating mailbox ${email} in org ${orgId}`);
  await delay(200 + Math.random() * 300); // 200-500ms delay

  const userId = `myp-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[MOCK] MYP: Mailbox ${email} created with user ID ${userId}`);

  return {
    userId,
  };
}

