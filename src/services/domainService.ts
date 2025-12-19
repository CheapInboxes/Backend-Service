import { supabase } from '../clients/infrastructure/supabase.js';
import { Domain, DomainRun } from '../types/index.js';
import { validateMembership } from './orgService.js';
import { createUsageEvent } from './usageService.js';
import * as namecheapClient from '../clients/domain-registrars/namecheap.js';
import * as resellerclubClient from '../clients/domain-registrars/resellerclub/index.js';
import * as cloudflareClient from '../clients/dns/cloudflare.js';
import { sendProvisioningFailed } from '../clients/notifications/index.js';

export async function createDomain(
  orgId: string,
  userId: string,
  domainName: string,
  sourceProvider: string,
  tags?: string[],
  autoRenew: boolean = true
): Promise<{ domain: Domain; run: DomainRun }> {
  // Validate membership
  const isMember = await validateMembership(orgId, userId);
  if (!isMember) {
    throw new Error('User is not a member of this organization');
  }

  // Create domain in pending status
  const { data: domain, error: domainError } = await supabase
    .from('domains')
    .insert({
      organization_id: orgId,
      domain: domainName,
      status: 'pending',
      source_provider: sourceProvider,
      tags: tags || [],
      external_refs: {},
      auto_renew: autoRenew,
    })
    .select()
    .single();

  if (domainError || !domain) {
    throw new Error(`Failed to create domain: ${domainError?.message || 'Unknown error'}`);
  }

  // Create domain run in queued status
  const { data: run, error: runError } = await supabase
    .from('domain_runs')
    .insert({
      organization_id: orgId,
      domain_id: domain.id,
      initiated_by_user_id: userId,
      status: 'queued',
    })
    .select()
    .single();

  if (runError || !run) {
    // Rollback: delete domain if run creation fails
    await supabase.from('domains').delete().eq('id', domain.id);
    throw new Error(`Failed to create domain run: ${runError?.message || 'Unknown error'}`);
  }

  // Write audit log (non-blocking)
  await supabase.from('audit_log').insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: 'domain.create',
    target_type: 'domain',
    target_id: domain.id,
    metadata: {
      domain: domainName,
      source_provider: sourceProvider,
    },
  });

  // Create usage event for billing
  try {
    await createUsageEvent(
      orgId,
      'domain_created',
      1,
      { domain_id: domain.id, domain: domainName, source_provider: sourceProvider },
      new Date()
    );
  } catch (error) {
    console.warn('Failed to create usage event:', error);
  }

  // Process the run immediately (synchronous for now)
  const { updatedDomain: provisionedDomain, updatedRun: provisionedRun } = await provisionDomain(run.id);

  return {
    domain: provisionedDomain,
    run: provisionedRun,
  };
}

export async function provisionDomain(runId: string): Promise<{
  updatedDomain: Domain;
  updatedRun: DomainRun;
}> {
  // Fetch the run
  const { data: run, error: runError } = await supabase
    .from('domain_runs')
    .select('*, domains(*)')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    throw new Error(`Domain run not found: ${runError?.message || 'Unknown error'}`);
  }

  const domain = (run as any).domains as unknown as Domain;

  try {
    // Update run to running
    await supabase
      .from('domain_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    // Update domain to provisioning
    await supabase
      .from('domains')
      .update({ status: 'provisioning' })
      .eq('id', domain.id);

    const externalRefs: Record<string, any> = {};

    // Provision based on source provider
    // 'cheapinboxes' = purchased through our platform (we register via ResellerClub)
    // 'namecheap' = imported domains from Namecheap
    // 'external' = domains already registered elsewhere (no registration needed)
    if (domain.source_provider === 'cheapinboxes') {
      // Register domain via ResellerClub (our backend registrar)
      const registerResult = await resellerclubClient.registerDomain(domain.domain);
      externalRefs.order_id = registerResult.orderId;
    } else if (domain.source_provider === 'namecheap') {
      // Register domain via Namecheap (for imported domains)
      const registerResult = await namecheapClient.registerDomain(domain.domain);
      externalRefs.order_id = registerResult.orderId;
    }

    // Always set up Cloudflare DNS
    const cloudflareResult = await cloudflareClient.createZone(domain.domain);
    externalRefs.cloudflare_zone_id = cloudflareResult.zoneId;
    externalRefs.cloudflare_nameservers = cloudflareResult.nameservers;

    // Set up DNS records (DKIM, SPF, etc.)
    await cloudflareClient.updateDNSRecords(cloudflareResult.zoneId, [
      { type: 'TXT', name: domain.domain, content: 'v=spf1 include:_spf.instantly.ai ~all' },
      { type: 'TXT', name: `_dmarc.${domain.domain}`, content: 'v=DMARC1; p=none;' },
    ]);

    // Update domain with external refs and set to ready - return the updated row
    const { data: updatedDomain, error: updateError } = await supabase
      .from('domains')
      .update({
        status: 'ready',
        external_refs: externalRefs,
      })
      .eq('id', domain.id)
      .select()
      .single();

    console.log('[DEBUG] Updated domain external_refs:', updatedDomain?.external_refs);
    console.log('[DEBUG] Expected external_refs:', externalRefs);

    if (updateError || !updatedDomain) {
      throw new Error(`Failed to update domain: ${updateError?.message || 'Unknown error'}`);
    }

    // Update run to succeeded - return the updated row
    const { data: updatedRun, error: runUpdateError } = await supabase
      .from('domain_runs')
      .update({ status: 'succeeded' })
      .eq('id', runId)
      .select()
      .single();

    if (runUpdateError || !updatedRun) {
      throw new Error(`Failed to update run: ${runUpdateError?.message || 'Unknown error'}`);
    }

    return {
      updatedDomain: updatedDomain as Domain,
      updatedRun: updatedRun as DomainRun,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update domain to error status
    await supabase
      .from('domains')
      .update({
        status: 'error',
        external_refs: {
          ...domain.external_refs,
          error: errorMessage,
        },
      })
      .eq('id', domain.id);

    // Update run to failed
    await supabase
      .from('domain_runs')
      .update({
        status: 'failed',
      })
      .eq('id', runId);

    // Send provisioning failed notification
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('billing_email')
        .eq('id', run.organization_id)
        .single();

      if (org?.billing_email) {
        await sendProvisioningFailed(org.billing_email, {
          domain: domain.domain,
          mailboxCount: 0, // Domain-level failure, no mailboxes yet
          reason: errorMessage,
        });
        console.log(`[DomainService] Sent provisioning failed notification for ${domain.domain}`);
      }
    } catch (emailErr: any) {
      console.error(`[DomainService] Failed to send provisioning failed email:`, emailErr.message);
    }

    throw error;
  }
}

export async function listDomains(
  orgId: string,
  filters?: { status?: string; tags?: string[] }
): Promise<Domain[]> {
  // Supabase has a default limit of 1000 rows, so we need to paginate for large orgs
  let allDomains: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase.from('domains').select('*').eq('organization_id', orgId);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to list domains: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allDomains = allDomains.concat(data);

    // If we got less than a full page, we're done
    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return allDomains as Domain[];
}

export async function getDomain(domainId: string, orgId: string): Promise<Domain> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('id', domainId)
    .eq('organization_id', orgId)
    .single();

  if (error || !data) {
    throw new Error('Domain not found or you do not have access');
  }

  return data as Domain;
}

export async function getDomainRuns(domainId: string, orgId: string): Promise<DomainRun[]> {
  // Verify domain belongs to org
  await getDomain(domainId, orgId);

  const { data, error } = await supabase
    .from('domain_runs')
    .select('*')
    .eq('domain_id', domainId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch domain runs: ${error.message}`);
  }

  return (data || []) as DomainRun[];
}

