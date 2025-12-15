import { supabase } from '../clients/infrastructure/supabase.js';
import { UsageEvent } from '../types/index.js';

export async function createUsageEvent(
  orgId: string,
  code: string,
  quantity: number,
  relatedIds?: Record<string, any>,
  effectiveAt?: Date
): Promise<UsageEvent> {
  const { data, error } = await supabase
    .from('usage_events')
    .insert({
      organization_id: orgId,
      code,
      quantity,
      effective_at: effectiveAt || new Date(),
      related_ids: relatedIds || {},
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create usage event: ${error?.message || 'Unknown error'}`);
  }

  return data as UsageEvent;
}

export async function listUsageEvents(
  orgId: string,
  filters?: { code?: string; start_date?: string; end_date?: string }
): Promise<UsageEvent[]> {
  let query = supabase
    .from('usage_events')
    .select('*')
    .eq('organization_id', orgId);

  if (filters?.code) {
    query = query.eq('code', filters.code);
  }

  if (filters?.start_date) {
    query = query.gte('effective_at', filters.start_date);
  }

  if (filters?.end_date) {
    query = query.lte('effective_at', filters.end_date);
  }

  const { data, error } = await query.order('effective_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list usage events: ${error.message}`);
  }

  return (data || []) as UsageEvent[];
}

export async function getUsageEvent(eventId: string, orgId: string): Promise<UsageEvent> {
  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('id', eventId)
    .eq('organization_id', orgId)
    .single();

  if (error || !data) {
    throw new Error('Usage event not found or you do not have access');
  }

  return data as UsageEvent;
}

