import { supabase } from '../clients/infrastructure/supabase.js';
import { Mailbox, MailboxRun, Domain } from '../types/index.js';
import { validateMembership } from './orgService.js';
import { getDomain } from './domainService.js';
import { createUsageEvent } from './usageService.js';
import * as mypClient from '../clients/mailbox-providers/myp.js';
import * as instantlyClient from '../clients/sending-platforms/instantly.js';

export async function createMailboxes(
  orgId: string,
  userId: string,
  domainId: string,
  count: number,
  firstNamePattern?: string,
  lastNamePattern?: string
): Promise<{ mailboxes: Mailbox[]; runs: MailboxRun[] }> {
  // Validate membership
  const isMember = await validateMembership(orgId, userId);
  if (!isMember) {
    throw new Error('User is not a member of this organization');
  }

  // Verify domain exists and belongs to org
  const domain = await getDomain(domainId, orgId);
  if (domain.status !== 'ready') {
    throw new Error(`Domain must be in 'ready' status before creating mailboxes`);
  }

  // Get MYP org ID from domain external_refs
  let mypOrgId = domain.external_refs?.myp_org_id;
  if (!mypOrgId) {
    // Create MYP organization if it doesn't exist
    const mypResult = await mypClient.createOrganization(domain.domain);
    const updatedDomain = await supabase
      .from('domains')
      .update({
        external_refs: {
          ...domain.external_refs,
          myp_org_id: mypResult.orgId,
        },
      })
      .eq('id', domainId)
      .select()
      .single();

    if (updatedDomain.data) {
      domain.external_refs = updatedDomain.data.external_refs as Record<string, any>;
      mypOrgId = mypResult.orgId;
    }
  }

  const mailboxes: Mailbox[] = [];
  const runs: MailboxRun[] = [];

  // Create mailboxes
  for (let i = 0; i < count; i++) {
    const firstName = firstNamePattern
      ? `${firstNamePattern}${i + 1}`
      : `user${i + 1}`;
    const lastName = lastNamePattern
      ? `${lastNamePattern}${i + 1}`
      : null;
    const fullEmail = `${firstName}@${domain.domain}`.toLowerCase();

    // Create mailbox in provisioning status
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .insert({
        organization_id: orgId,
        domain_id: domainId,
        full_email: fullEmail,
        first_name: firstName,
        last_name: lastName,
        status: 'provisioning',
        source_provider: 'myp',
        external_refs: {},
        daily_limit: 50,
      })
      .select()
      .single();

    if (mailboxError || !mailbox) {
      throw new Error(`Failed to create mailbox: ${mailboxError?.message || 'Unknown error'}`);
    }

    // Create mailbox run in queued status
    const { data: run, error: runError } = await supabase
      .from('mailbox_runs')
      .insert({
        organization_id: orgId,
        domain_id: domainId,
        mailbox_id: mailbox.id,
        initiated_by_user_id: userId,
        status: 'queued',
      })
      .select()
      .single();

    if (runError || !run) {
      // Rollback: delete mailbox if run creation fails
      await supabase.from('mailboxes').delete().eq('id', mailbox.id);
      throw new Error(`Failed to create mailbox run: ${runError?.message || 'Unknown error'}`);
    }

    mailboxes.push(mailbox as Mailbox);
    runs.push(run as MailboxRun);

    // Process the run immediately (synchronous for now)
    await provisionMailbox(run.id);

    // Fetch updated mailbox and run
    const { data: updatedMailbox } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', mailbox.id)
      .single();

    const { data: updatedRun } = await supabase
      .from('mailbox_runs')
      .select('*')
      .eq('id', run.id)
      .single();

    if (updatedMailbox) {
      mailboxes[i] = updatedMailbox as Mailbox;
    }
    if (updatedRun) {
      runs[i] = updatedRun as MailboxRun;
    }
  }

  // Write audit log (non-blocking)
  await supabase.from('audit_log').insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: 'mailboxes.create',
    target_type: 'domain',
    target_id: domainId,
    metadata: {
      count,
      domain: domain.domain,
    },
  });

  // Create usage events for billing (one per mailbox)
  try {
    await createUsageEvent(
      orgId,
      'mailbox_created',
      count,
      {
        domain_id: domainId,
        domain: domain.domain,
        mailbox_ids: mailboxes.map((m) => m.id),
      },
      new Date()
    );
  } catch (error) {
    console.warn('Failed to create usage event:', error);
  }

  return { mailboxes, runs };
}

export async function provisionMailbox(runId: string): Promise<void> {
  // Fetch the run
  const { data: run, error: runError } = await supabase
    .from('mailbox_runs')
    .select('*, mailboxes(*), domains(*)')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    throw new Error(`Mailbox run not found: ${runError?.message || 'Unknown error'}`);
  }

  const mailbox = (run as any).mailboxes as unknown as Mailbox;
  const domain = (run as any).domains as unknown as Domain;

  if (!mailbox || !domain) {
    throw new Error('Mailbox or domain not found');
  }

  try {
    // Update run to running
    await supabase
      .from('mailbox_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    // Get MYP org ID from domain external_refs
    const mypOrgId = domain.external_refs?.myp_org_id;
    if (!mypOrgId) {
      throw new Error('MYP organization ID not found for domain');
    }

    // Create mailbox in MYP
    const mypResult = await mypClient.createMailbox(
      mypOrgId,
      mailbox.full_email,
      mailbox.first_name || '',
      mailbox.last_name || ''
    );

    // Add account to Instantly.ai
    const instantlyResult = await instantlyClient.addAccount(mailbox.full_email, domain.domain);

    const externalRefs: Record<string, any> = {
      ...mailbox.external_refs,
      myp_user_id: mypResult.userId,
      instantly_account_id: instantlyResult.accountId,
    };

    // Update mailbox with external refs and set to active
    await supabase
      .from('mailboxes')
      .update({
        status: 'active',
        external_refs: externalRefs,
      })
      .eq('id', mailbox.id);

    // Update run to succeeded
    await supabase
      .from('mailbox_runs')
      .update({ status: 'succeeded' })
      .eq('id', runId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update mailbox to error status
    await supabase
      .from('mailboxes')
      .update({
        status: 'error',
        external_refs: {
          ...mailbox.external_refs,
          error: errorMessage,
        },
      })
      .eq('id', mailbox.id);

    // Update run to failed
    await supabase
      .from('mailbox_runs')
      .update({
        status: 'failed',
      })
      .eq('id', runId);

    throw error;
  }
}

export async function listMailboxes(
  orgId: string,
  domainId?: string,
  filters?: { status?: string }
): Promise<Mailbox[]> {
  // Supabase has a default limit of 1000 rows, so we need to paginate for large orgs
  let allMailboxes: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase.from('mailboxes').select('*').eq('organization_id', orgId);

    if (domainId) {
      query = query.eq('domain_id', domainId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to list mailboxes: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allMailboxes = allMailboxes.concat(data);

    // If we got less than a full page, we're done
    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return allMailboxes as Mailbox[];
}

export async function getMailbox(mailboxId: string, orgId: string): Promise<Mailbox> {
  const { data, error } = await supabase
    .from('mailboxes')
    .select('*')
    .eq('id', mailboxId)
    .eq('organization_id', orgId)
    .single();

  if (error || !data) {
    throw new Error('Mailbox not found or you do not have access');
  }

  return data as Mailbox;
}

export async function updateMailbox(
  mailboxId: string,
  orgId: string,
  updates: { status?: 'active' | 'paused' }
): Promise<Mailbox> {
  // Verify mailbox exists and belongs to org
  await getMailbox(mailboxId, orgId);

  const { data, error } = await supabase
    .from('mailboxes')
    .update(updates)
    .eq('id', mailboxId)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update mailbox: ${error?.message || 'Unknown error'}`);
  }

  return data as Mailbox;
}

