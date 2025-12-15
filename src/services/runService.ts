import { provisionDomain } from './domainService.js';
import { provisionMailbox } from './mailboxService.js';
import { supabase } from '../clients/infrastructure/supabase.js';

export async function processDomainRun(runId: string): Promise<void> {
  try {
    await provisionDomain(runId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to process domain run ${runId}:`, errorMessage);
    throw error;
  }
}

export async function processMailboxRun(runId: string): Promise<void> {
  try {
    await provisionMailbox(runId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to process mailbox run ${runId}:`, errorMessage);
    throw error;
  }
}

export async function retryRun(runId: string, type: 'domain' | 'mailbox'): Promise<void> {
  const tableName = type === 'domain' ? 'domain_runs' : 'mailbox_runs';

  // Check current status
  const { data: run, error: fetchError } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', runId)
    .single();

  if (fetchError || !run) {
    throw new Error(`Run not found: ${fetchError?.message || 'Unknown error'}`);
  }

  if (run.status !== 'failed') {
    throw new Error(`Can only retry failed runs. Current status: ${run.status}`);
  }

  // Reset to queued
  const { error: updateError } = await supabase
    .from(tableName)
    .update({ status: 'queued' })
    .eq('id', runId);

  if (updateError) {
    throw new Error(`Failed to reset run: ${updateError.message}`);
  }

  // Process the run
  if (type === 'domain') {
    await processDomainRun(runId);
  } else {
    await processMailboxRun(runId);
  }
}

