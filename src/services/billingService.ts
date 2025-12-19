import { supabase } from '../clients/infrastructure/supabase.js';
import {
  createStripeCustomer,
  getStripeCustomer,
  createSetupCheckoutSession,
  listPaymentMethods,
  detachPaymentMethod,
  createStripeInvoice,
  addInvoiceLineItem,
  finalizeInvoice,
  payInvoice,
} from '../clients/infrastructure/stripe.js';
import type Stripe from 'stripe';
import type { 
  PricingRuleCondition, 
  PricingRuleWithConditions 
} from '../types/index.js';

// Types
export interface Organization {
  id: string;
  name: string;
  billing_email: string;
  stripe_customer_id: string | null;
  currency: string;
}

export interface PricebookItem {
  id: string;
  code: string;
  name: string;
  base_unit_price_cents: number;
  billing_strategy: 'per_event' | 'monthly_recurring' | 'annual_recurring' | 'one_time';
  billing_period_months: number | null;
  metadata: Record<string, any>;
}

export interface PricingRule {
  id: string;
  name: string;
  description: string | null;
  scope_type: 'global' | 'organization' | 'item';
  organization_id: string | null;
  pricebook_item_id: string | null;
  rule_type: 'percent_discount' | 'fixed_discount' | 'override_price';
  value: number;
  priority: number;
  active_from: string;
  active_to: string | null;
}

export interface UsageSummary {
  period_start: string;
  period_end: string;
  items: UsageSummaryItem[];
  total_cents: number;
}

export interface UsageSummaryItem {
  code: string;
  name: string;
  quantity: number;
  base_unit_price_cents: number;
  final_unit_price_cents: number;
  discount_percent: number | null;
  discount_amount_cents: number | null;
  total_cents: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  order_id: string | null;
  period_start: string;
  period_end: string;
  total_cents: number;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  stripe_invoice_id: string | null;
  created_at: string;
  // Joined from payment when available
  receipt_url?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string | null;
  organization_id: string;
  pricebook_item_id: string;
  code: string;
  quantity: number;
  base_unit_price_cents: number;
  discount_percent: number | null;
  discount_amount_cents: number | null;
  final_unit_price_cents: number;
  total_cents: number;
  period: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  invoice_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled';
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  receipt_url: string | null;
  processed_at: string;
}

// ==================== Organization & Stripe Customer ====================

/**
 * Ensure an organization has a Stripe customer, creating one if needed
 */
export async function ensureStripeCustomer(orgId: string): Promise<string> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, billing_email, stripe_customer_id')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  if (org.stripe_customer_id) {
    // Verify customer still exists in Stripe
    const customer = await getStripeCustomer(org.stripe_customer_id);
    if (customer) {
      return org.stripe_customer_id;
    }
  }

  // Create new Stripe customer
  const customer = await createStripeCustomer(org.billing_email, org.name, {
    organization_id: orgId,
  });

  // Update organization with Stripe customer ID
  await supabase
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId);

  return customer.id;
}

// ==================== Checkout & Payment Methods ====================

/**
 * Create a Stripe Checkout session for adding a payment method
 */
export async function createCheckoutSession(
  orgId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const customerId = await ensureStripeCustomer(orgId);
  const session = await createSetupCheckoutSession(customerId, successUrl, cancelUrl);
  
  return {
    sessionId: session.id,
    url: session.url || '',
  };
}

/**
 * Get payment methods for an organization
 */
export async function getPaymentMethods(orgId: string): Promise<Stripe.PaymentMethod[]> {
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single();

  if (!org?.stripe_customer_id) {
    return [];
  }

  return listPaymentMethods(org.stripe_customer_id);
}

/**
 * Remove a payment method
 */
export async function removePaymentMethod(orgId: string, paymentMethodId: string): Promise<void> {
  // Verify the payment method belongs to this org's customer
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single();

  if (!org?.stripe_customer_id) {
    throw new Error('Organization has no Stripe customer');
  }

  const paymentMethods = await listPaymentMethods(org.stripe_customer_id);
  const pm = paymentMethods.find((p) => p.id === paymentMethodId);
  
  if (!pm) {
    throw new Error('Payment method not found or does not belong to this organization');
  }

  await detachPaymentMethod(paymentMethodId);
}

// ==================== Pricebook & Pricing Rules ====================

/**
 * Get all pricebook items
 */
export async function getPricebookItems(): Promise<PricebookItem[]> {
  const { data, error } = await supabase
    .from('pricebook_items')
    .select('*')
    .order('code');

  if (error) {
    throw new Error(`Failed to fetch pricebook items: ${error.message}`);
  }

  return data as PricebookItem[];
}

/**
 * Get a pricebook item by code
 */
export async function getPricebookItemByCode(code: string): Promise<PricebookItem | null> {
  const { data, error } = await supabase
    .from('pricebook_items')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    return null;
  }

  return data as PricebookItem;
}

export interface MailboxPricingTier {
  minQty: number;
  maxQty: number | null;
  priceCents: number;
  priceFormatted: string;
}

export interface MailboxPricing {
  basePriceCents: number;
  tiers: MailboxPricingTier[];
}

/**
 * Get mailbox pricing tiers from the database
 * Returns the base price and volume discount tiers
 */
export async function getMailboxPricingTiers(): Promise<MailboxPricing> {
  // Get base price from pricebook (use Google as canonical, both are same)
  const { data: pricebookItem } = await supabase
    .from('pricebook_items')
    .select('base_unit_price_cents')
    .eq('code', 'mailbox_monthly_google')
    .single();

  const basePriceCents = pricebookItem?.base_unit_price_cents || 350;

  // Get mailbox pricing rules with their conditions
  // These are the override_price rules for mailbox volume discounts
  const { data: rules } = await supabase
    .from('pricing_rules')
    .select(`
      id,
      name,
      value,
      priority,
      pricing_rule_conditions (
        condition_type,
        operator,
        value
      )
    `)
    .eq('rule_type', 'override_price')
    .eq('scope_type', 'global')
    .lte('active_from', new Date().toISOString())
    .or('active_to.is.null,active_to.gt.' + new Date().toISOString())
    .order('priority', { ascending: true });

  // Build tiers from rules
  const tiers: MailboxPricingTier[] = [];

  // Add base tier (0-99 at base price)
  tiers.push({
    minQty: 0,
    maxQty: 99,
    priceCents: basePriceCents,
    priceFormatted: `$${(basePriceCents / 100).toFixed(2)}`,
  });

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      const conditions = rule.pricing_rule_conditions || [];
      
      // Get min/max quantity from conditions
      const minCondition = conditions.find(
        (c: any) => c.condition_type === 'min_quantity' && c.operator === 'gte'
      );
      const maxCondition = conditions.find(
        (c: any) => c.condition_type === 'min_quantity' && c.operator === 'lte'
      );

      if (minCondition) {
        const minQty = minCondition.value?.value || 0;
        const maxQty = maxCondition?.value?.value || null;
        const priceCents = rule.value;

        tiers.push({
          minQty,
          maxQty,
          priceCents,
          priceFormatted: `$${(priceCents / 100).toFixed(2)}`,
        });
      }
    }
  }

  // Sort by minQty ascending
  tiers.sort((a, b) => a.minQty - b.minQty);

  return {
    basePriceCents,
    tiers,
  };
}

/**
 * Create a pricebook item
 */
export async function createPricebookItem(
  item: Omit<PricebookItem, 'id'>
): Promise<PricebookItem> {
  const { data, error } = await supabase
    .from('pricebook_items')
    .insert(item)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create pricebook item: ${error.message}`);
  }

  return data as PricebookItem;
}

/**
 * Update a pricebook item
 */
export async function updatePricebookItem(
  id: string,
  updates: Partial<Omit<PricebookItem, 'id'>>
): Promise<PricebookItem> {
  const { data, error } = await supabase
    .from('pricebook_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update pricebook item: ${error.message}`);
  }

  return data as PricebookItem;
}

/**
 * Get pricing rules for an organization and/or item
 */
export async function getPricingRules(
  orgId?: string,
  pricebookItemId?: string
): Promise<PricingRule[]> {
  let query = supabase
    .from('pricing_rules')
    .select('*')
    .lte('active_from', new Date().toISOString());

  // Filter by active rules (no end date or end date in future)
  query = query.or('active_to.is.null,active_to.gt.' + new Date().toISOString());

  if (orgId) {
    query = query.or(`scope_type.eq.global,organization_id.eq.${orgId}`);
  } else {
    query = query.eq('scope_type', 'global');
  }

  if (pricebookItemId) {
    query = query.or(`scope_type.neq.item,pricebook_item_id.eq.${pricebookItemId}`);
  }

  const { data, error } = await query.order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch pricing rules: ${error.message}`);
  }

  return data as PricingRule[];
}

/**
 * Get all pricing rules (admin)
 */
export async function getAllPricingRules(): Promise<PricingRule[]> {
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*')
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch pricing rules: ${error.message}`);
  }

  return data as PricingRule[];
}

/**
 * Create a pricing rule
 */
export async function createPricingRule(
  rule: Omit<PricingRule, 'id'>
): Promise<PricingRule> {
  const { data, error } = await supabase
    .from('pricing_rules')
    .insert(rule)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create pricing rule: ${error.message}`);
  }

  return data as PricingRule;
}

/**
 * Update a pricing rule
 */
export async function updatePricingRule(
  id: string,
  updates: Partial<Omit<PricingRule, 'id'>>
): Promise<PricingRule> {
  const { data, error } = await supabase
    .from('pricing_rules')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update pricing rule: ${error.message}`);
  }

  return data as PricingRule;
}

/**
 * Delete a pricing rule
 */
export async function deletePricingRule(id: string): Promise<void> {
  const { error } = await supabase
    .from('pricing_rules')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete pricing rule: ${error.message}`);
  }
}

// ==================== Pricing Rule Conditions ====================

/**
 * Get conditions for a pricing rule
 */
export async function getPricingRuleConditions(ruleId: string): Promise<PricingRuleCondition[]> {
  const { data, error } = await supabase
    .from('pricing_rule_conditions')
    .select('*')
    .eq('pricing_rule_id', ruleId)
    .order('group_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch pricing rule conditions: ${error.message}`);
  }

  return data as PricingRuleCondition[];
}

/**
 * Get pricing rules with their conditions
 */
export async function getPricingRulesWithConditions(
  orgId?: string,
  pricebookItemId?: string
): Promise<PricingRuleWithConditions[]> {
  // First get the rules
  const rules = await getPricingRules(orgId, pricebookItemId);
  
  if (rules.length === 0) {
    return [];
  }

  // Get all conditions for these rules
  const ruleIds = rules.map(r => r.id);
  const { data: conditions, error } = await supabase
    .from('pricing_rule_conditions')
    .select('*')
    .in('pricing_rule_id', ruleIds)
    .order('group_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch conditions: ${error.message}`);
  }

  // Map conditions to rules
  const conditionsByRule: Record<string, PricingRuleCondition[]> = {};
  for (const condition of (conditions || [])) {
    if (!conditionsByRule[condition.pricing_rule_id]) {
      conditionsByRule[condition.pricing_rule_id] = [];
    }
    conditionsByRule[condition.pricing_rule_id].push(condition as PricingRuleCondition);
  }

  return rules.map(rule => ({
    ...rule,
    conditions: conditionsByRule[rule.id] || [],
  }));
}

/**
 * Get all pricing rules with conditions (admin)
 */
export async function getAllPricingRulesWithConditions(): Promise<PricingRuleWithConditions[]> {
  const rules = await getAllPricingRules();
  
  if (rules.length === 0) {
    return [];
  }

  const ruleIds = rules.map(r => r.id);
  const { data: conditions, error } = await supabase
    .from('pricing_rule_conditions')
    .select('*')
    .in('pricing_rule_id', ruleIds)
    .order('group_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch conditions: ${error.message}`);
  }

  const conditionsByRule: Record<string, PricingRuleCondition[]> = {};
  for (const condition of (conditions || [])) {
    if (!conditionsByRule[condition.pricing_rule_id]) {
      conditionsByRule[condition.pricing_rule_id] = [];
    }
    conditionsByRule[condition.pricing_rule_id].push(condition as PricingRuleCondition);
  }

  return rules.map(rule => ({
    ...rule,
    conditions: conditionsByRule[rule.id] || [],
  }));
}

/**
 * Create conditions for a pricing rule
 */
export async function createPricingRuleConditions(
  ruleId: string,
  conditions: Omit<PricingRuleCondition, 'id' | 'pricing_rule_id' | 'created_at'>[]
): Promise<PricingRuleCondition[]> {
  if (conditions.length === 0) {
    return [];
  }

  const conditionsWithRuleId = conditions.map(c => ({
    ...c,
    pricing_rule_id: ruleId,
  }));

  const { data, error } = await supabase
    .from('pricing_rule_conditions')
    .insert(conditionsWithRuleId)
    .select();

  if (error) {
    throw new Error(`Failed to create pricing rule conditions: ${error.message}`);
  }

  return data as PricingRuleCondition[];
}

/**
 * Update conditions for a pricing rule (replaces all existing conditions)
 */
export async function updatePricingRuleConditions(
  ruleId: string,
  conditions: Omit<PricingRuleCondition, 'id' | 'pricing_rule_id' | 'created_at'>[]
): Promise<PricingRuleCondition[]> {
  // Delete existing conditions
  await supabase
    .from('pricing_rule_conditions')
    .delete()
    .eq('pricing_rule_id', ruleId);

  // Create new conditions
  return createPricingRuleConditions(ruleId, conditions);
}

/**
 * Delete a specific condition
 */
export async function deletePricingRuleCondition(conditionId: string): Promise<void> {
  const { error } = await supabase
    .from('pricing_rule_conditions')
    .delete()
    .eq('id', conditionId);

  if (error) {
    throw new Error(`Failed to delete condition: ${error.message}`);
  }
}

// ==================== Pricing Rule Usage Tracking ====================

/**
 * Get usage count for a pricing rule
 */
export async function getPricingRuleUsage(
  ruleId: string,
  orgId?: string,
  pricebookItemId?: string
): Promise<number> {
  let query = supabase
    .from('pricing_rule_usage')
    .select('usage_count')
    .eq('pricing_rule_id', ruleId);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  } else {
    query = query.is('organization_id', null);
  }

  if (pricebookItemId) {
    query = query.eq('pricebook_item_id', pricebookItemId);
  } else {
    query = query.is('pricebook_item_id', null);
  }

  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    throw new Error(`Failed to fetch rule usage: ${error.message}`);
  }

  return data?.usage_count || 0;
}

/**
 * Increment usage count for a pricing rule
 */
export async function incrementPricingRuleUsage(
  ruleId: string,
  orgId?: string,
  pricebookItemId?: string
): Promise<void> {
  // Try to upsert the usage record
  const { error } = await supabase.rpc('increment_pricing_rule_usage', {
    p_rule_id: ruleId,
    p_org_id: orgId || null,
    p_item_id: pricebookItemId || null,
  });

  if (error) {
    // Fallback: try manual upsert
    const existing = await getPricingRuleUsage(ruleId, orgId, pricebookItemId);
    
    if (existing === 0) {
      await supabase.from('pricing_rule_usage').insert({
        pricing_rule_id: ruleId,
        organization_id: orgId || null,
        pricebook_item_id: pricebookItemId || null,
        usage_count: 1,
      });
    } else {
      await supabase
        .from('pricing_rule_usage')
        .update({ usage_count: existing + 1 })
        .eq('pricing_rule_id', ruleId)
        .eq('organization_id', orgId || null)
        .eq('pricebook_item_id', pricebookItemId || null);
    }
  }
}

// ==================== Condition Evaluation ====================

interface EvaluationContext {
  orgId?: string;
  pricebookItemId?: string;
  quantity?: number;
  orgSegment?: string;
  currentDate?: Date;
}

/**
 * Evaluate a single condition
 */
async function evaluateCondition(
  condition: PricingRuleCondition,
  context: EvaluationContext
): Promise<boolean> {
  const { condition_type, operator, value } = condition;

  switch (condition_type) {
    case 'organization': {
      const ids: string[] = value.ids || [];
      if (!context.orgId) return false;
      if (operator === 'in') return ids.includes(context.orgId);
      if (operator === 'not_in') return !ids.includes(context.orgId);
      return false;
    }

    case 'pricebook_item': {
      const ids: string[] = value.ids || [];
      if (!context.pricebookItemId) return false;
      if (operator === 'in') return ids.includes(context.pricebookItemId);
      if (operator === 'not_in') return !ids.includes(context.pricebookItemId);
      return false;
    }

    case 'max_uses': {
      const limit: number = value.limit || 0;
      const scope: string = value.scope || 'global';
      
      let usageOrgId: string | undefined;
      let usageItemId: string | undefined;
      
      // Determine scope for usage lookup
      if (scope === 'per_org' || scope === 'per_org_item') {
        usageOrgId = context.orgId;
      }
      if (scope === 'per_item' || scope === 'per_org_item') {
        usageItemId = context.pricebookItemId;
      }
      
      const currentUsage = await getPricingRuleUsage(
        condition.pricing_rule_id,
        usageOrgId,
        usageItemId
      );
      
      return currentUsage < limit;
    }

    case 'min_quantity': {
      const minValue: number = value.value || 0;
      const qty = context.quantity || 0;
      if (operator === 'gte') return qty >= minValue;
      if (operator === 'eq') return qty === minValue;
      return qty >= minValue;
    }

    case 'date_range': {
      const now = context.currentDate || new Date();
      const start = value.start ? new Date(value.start) : null;
      const end = value.end ? new Date(value.end) : null;
      
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;
    }

    case 'org_segment': {
      const segments: string[] = value.segments || [];
      if (!context.orgSegment) return false;
      if (operator === 'in') return segments.includes(context.orgSegment);
      if (operator === 'not_in') return !segments.includes(context.orgSegment);
      return false;
    }

    default:
      return true;
  }
}

/**
 * Evaluate all conditions for a rule using AND/OR grouping
 * Conditions with the same group_id are AND'd together
 * Different groups are OR'd together
 */
export async function evaluateRuleConditions(
  conditions: PricingRuleCondition[],
  context: EvaluationContext
): Promise<boolean> {
  if (conditions.length === 0) {
    return true; // No conditions = rule always applies
  }

  // Group conditions by group_id
  const groups: Record<number, PricingRuleCondition[]> = {};
  for (const condition of conditions) {
    if (!groups[condition.group_id]) {
      groups[condition.group_id] = [];
    }
    groups[condition.group_id].push(condition);
  }

  // Evaluate each group (OR between groups)
  for (const groupConditions of Object.values(groups)) {
    // All conditions in a group must pass (AND)
    let groupPasses = true;
    for (const condition of groupConditions) {
      const result = await evaluateCondition(condition, context);
      if (!result) {
        groupPasses = false;
        break;
      }
    }
    
    // If any group passes, the rule applies (OR)
    if (groupPasses) {
      return true;
    }
  }

  return false;
}

/**
 * Filter applicable rules based on conditions
 */
export async function filterApplicableRules(
  rules: PricingRuleWithConditions[],
  context: EvaluationContext
): Promise<PricingRuleWithConditions[]> {
  const applicable: PricingRuleWithConditions[] = [];
  
  for (const rule of rules) {
    const passes = await evaluateRuleConditions(rule.conditions, context);
    if (passes) {
      applicable.push(rule);
    }
  }
  
  return applicable;
}

/**
 * Apply pricing rules to calculate final price
 */
export function applyPricingRules(
  basePriceCents: number,
  rules: PricingRule[]
): { finalPriceCents: number; discountPercent: number | null; discountAmountCents: number | null } {
  if (rules.length === 0) {
    return { finalPriceCents: basePriceCents, discountPercent: null, discountAmountCents: null };
  }

  // Get highest priority rule
  const rule = rules[0];

  switch (rule.rule_type) {
    case 'percent_discount': {
      const discount = Math.round(basePriceCents * (rule.value / 100));
      return {
        finalPriceCents: basePriceCents - discount,
        discountPercent: rule.value,
        discountAmountCents: discount,
      };
    }
    case 'fixed_discount': {
      return {
        finalPriceCents: Math.max(0, basePriceCents - rule.value),
        discountPercent: null,
        discountAmountCents: rule.value,
      };
    }
    case 'override_price': {
      return {
        finalPriceCents: rule.value,
        discountPercent: null,
        discountAmountCents: basePriceCents - rule.value,
      };
    }
    default:
      return { finalPriceCents: basePriceCents, discountPercent: null, discountAmountCents: null };
  }
}

// ==================== Usage Summary ====================

/**
 * Get usage summary for an organization for a given period
 */
export async function getUsageSummary(
  orgId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsageSummary> {
  // Get usage events for the period
  const { data: usageEvents, error: usageError } = await supabase
    .from('usage_events')
    .select('code, quantity')
    .eq('organization_id', orgId)
    .gte('effective_at', periodStart.toISOString())
    .lte('effective_at', periodEnd.toISOString());

  if (usageError) {
    throw new Error(`Failed to fetch usage events: ${usageError.message}`);
  }

  // Aggregate by code
  const aggregated: Record<string, number> = {};
  for (const event of usageEvents || []) {
    aggregated[event.code] = (aggregated[event.code] || 0) + event.quantity;
  }

  // Get pricebook items and pricing rules
  const pricebookItems = await getPricebookItems();
  const pricingRules = await getPricingRules(orgId);

  const items: UsageSummaryItem[] = [];
  let totalCents = 0;

  for (const [code, quantity] of Object.entries(aggregated)) {
    const pricebookItem = pricebookItems.find((p) => p.code === code);
    if (!pricebookItem) {
      // Unknown code - skip or use default
      continue;
    }

    // Get applicable rules for this item
    const itemRules = pricingRules.filter(
      (r) =>
        r.scope_type === 'global' ||
        (r.scope_type === 'organization' && r.organization_id === orgId) ||
        (r.scope_type === 'item' && r.pricebook_item_id === pricebookItem.id)
    );

    const { finalPriceCents, discountPercent, discountAmountCents } = applyPricingRules(
      pricebookItem.base_unit_price_cents,
      itemRules
    );

    const itemTotal = finalPriceCents * quantity;
    totalCents += itemTotal;

    items.push({
      code,
      name: pricebookItem.name,
      quantity,
      base_unit_price_cents: pricebookItem.base_unit_price_cents,
      final_unit_price_cents: finalPriceCents,
      discount_percent: discountPercent,
      discount_amount_cents: discountAmountCents,
      total_cents: itemTotal,
    });
  }

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    items,
    total_cents: totalCents,
  };
}

// ==================== Invoices ====================

/**
 * Get invoices for an organization with receipt URLs from payments
 */
export async function getInvoices(orgId: string): Promise<Invoice[]> {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  // Get receipt URLs from payments
  const invoiceIds = invoices.map(i => i.id);
  const { data: payments } = await supabase
    .from('payments')
    .select('invoice_id, receipt_url')
    .in('invoice_id', invoiceIds);

  // Map receipt URLs to invoices
  const receiptByInvoice = new Map<string, string | null>();
  if (payments) {
    for (const p of payments) {
      if (p.invoice_id && p.receipt_url) {
        receiptByInvoice.set(p.invoice_id, p.receipt_url);
      }
    }
  }

  return invoices.map(inv => ({
    ...inv,
    receipt_url: receiptByInvoice.get(inv.id) || null,
  })) as Invoice[];
}

/**
 * Get all invoices (admin)
 */
export async function getAllInvoices(filters?: {
  status?: string;
  orgId?: string;
}): Promise<Invoice[]> {
  let query = supabase.from('invoices').select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.orgId) {
    query = query.eq('organization_id', filters.orgId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  return data as Invoice[];
}

/**
 * Get invoice by ID with line items
 * For order invoices, also fetches the order's cart line items
 */
export async function getInvoiceWithItems(
  invoiceId: string,
  orgId?: string
): Promise<{ invoice: Invoice; items: InvoiceItem[]; orderLineItems?: OrderInvoiceLineItem[] } | null> {
  let query = supabase.from('invoices').select('*').eq('id', invoiceId);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }

  const { data: invoice, error: invoiceError } = await query.single();

  if (invoiceError || !invoice) {
    return null;
  }

  // Get receipt URL from payment
  const { data: payment } = await supabase
    .from('payments')
    .select('receipt_url')
    .eq('invoice_id', invoiceId)
    .single();

  const invoiceWithReceipt: Invoice = {
    ...invoice,
    receipt_url: payment?.receipt_url || null,
  };

  // Get standard invoice items (for usage-based invoices)
  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (itemsError) {
    throw new Error(`Failed to fetch invoice items: ${itemsError.message}`);
  }

  // If this is an order invoice, get the order line items from cart_snapshot
  let orderLineItems: OrderInvoiceLineItem[] | undefined;
  if (invoice.order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('cart_snapshot')
      .eq('id', invoice.order_id)
      .single();

    if (order?.cart_snapshot) {
      orderLineItems = buildOrderLineItems(order.cart_snapshot);
    }
  }

  return {
    invoice: invoiceWithReceipt,
    items: (items || []) as InvoiceItem[],
    orderLineItems,
  };
}

// Line item type for order invoices
export interface OrderInvoiceLineItem {
  type: 'domain' | 'mailbox';
  description: string;
  domain?: string;
  provider?: 'google' | 'microsoft';
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

// Volume pricing tiers (in cents) - matches orderService.ts
// 0-99: $3.50, 100-249: $3.25, 250-999: $3.00, 1000+: $2.80
const VOLUME_PRICING_TIERS = [
  { minQty: 1000, price: 280 },
  { minQty: 250, price: 300 },
  { minQty: 100, price: 325 },
  { minQty: 0, price: 350 },
] as const;

function getMailboxPriceForQuantity(totalQuantity: number): number {
  for (const tier of VOLUME_PRICING_TIERS) {
    if (totalQuantity >= tier.minQty) {
      return tier.price;
    }
  }
  return 350; // Default base price
}

// Build line items from cart snapshot
function buildOrderLineItems(cartSnapshot: any): OrderInvoiceLineItem[] {
  const items: OrderInvoiceLineItem[] = [];
  
  // Calculate total mailboxes first for volume pricing
  const totalMailboxes = (cartSnapshot.totals?.totalGoogleMailboxes || 0) + 
                         (cartSnapshot.totals?.totalMicrosoftMailboxes || 0);
  const mailboxUnitPrice = getMailboxPriceForQuantity(totalMailboxes);

  for (const domain of cartSnapshot.domains || []) {
    const priceCents = Math.round(domain.price * 100);
    items.push({
      type: 'domain',
      description: `Domain: ${domain.domain}`,
      domain: domain.domain,
      quantity: 1,
      unit_price_cents: priceCents,
      total_cents: priceCents,
    });

    if (domain.mailboxes?.count > 0) {
      const provider = domain.mailboxes.provider;
      const providerName = provider === 'google' ? 'Google Workspace' : 'Microsoft 365';
      
      items.push({
        type: 'mailbox',
        description: `${providerName} Mailbox (First Month) - ${domain.domain}`,
        domain: domain.domain,
        provider: provider,
        quantity: domain.mailboxes.count,
        unit_price_cents: mailboxUnitPrice,
        total_cents: mailboxUnitPrice * domain.mailboxes.count,
      });
    }
  }

  return items;
}

/**
 * Generate invoice for an organization for a billing period
 */
export async function generateInvoice(
  orgId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Invoice> {
  // Get usage summary
  const summary = await getUsageSummary(orgId, periodStart, periodEnd);

  if (summary.items.length === 0) {
    throw new Error('No usage to invoice');
  }

  // Get pricebook items for IDs
  const pricebookItems = await getPricebookItems();

  // Create invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      total_cents: summary.total_cents,
      status: 'draft',
    })
    .select()
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Failed to create invoice: ${invoiceError?.message}`);
  }

  // Create invoice items
  for (const item of summary.items) {
    const pricebookItem = pricebookItems.find((p) => p.code === item.code);
    if (!pricebookItem) continue;

    await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      organization_id: orgId,
      pricebook_item_id: pricebookItem.id,
      code: item.code,
      quantity: item.quantity,
      base_unit_price_cents: item.base_unit_price_cents,
      discount_percent: item.discount_percent,
      discount_amount_cents: item.discount_amount_cents,
      final_unit_price_cents: item.final_unit_price_cents,
      total_cents: item.total_cents,
      period: periodStart.toISOString().split('T')[0],
    });
  }

  return invoice as Invoice;
}

/**
 * Sync invoice to Stripe and optionally finalize
 */
export async function syncInvoiceToStripe(
  invoiceId: string,
  autoFinalize: boolean = false
): Promise<Invoice> {
  const invoiceData = await getInvoiceWithItems(invoiceId);
  if (!invoiceData) {
    throw new Error('Invoice not found');
  }

  const { invoice, items } = invoiceData;

  // Ensure org has Stripe customer
  const customerId = await ensureStripeCustomer(invoice.organization_id);

  // Create Stripe invoice
  const stripeInvoice = await createStripeInvoice(customerId, {
    invoice_id: invoice.id,
    organization_id: invoice.organization_id,
  });

  // Add line items
  for (const item of items) {
    await addInvoiceLineItem(
      stripeInvoice.id,
      item.code,
      item.final_unit_price_cents,
      item.quantity
    );
  }

  // Update our invoice with Stripe ID
  let status: Invoice['status'] = 'open';
  let finalStripeInvoice = stripeInvoice;

  if (autoFinalize) {
    finalStripeInvoice = await finalizeInvoice(stripeInvoice.id);
    status = finalStripeInvoice.status === 'paid' ? 'paid' : 'open';
  }

  const { data: updatedInvoice, error } = await supabase
    .from('invoices')
    .update({
      stripe_invoice_id: finalStripeInvoice.id,
      status,
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error || !updatedInvoice) {
    throw new Error(`Failed to update invoice: ${error?.message}`);
  }

  return updatedInvoice as Invoice;
}

/**
 * Process payment for an invoice
 */
export async function processInvoicePayment(invoiceId: string): Promise<Payment> {
  const invoiceData = await getInvoiceWithItems(invoiceId);
  if (!invoiceData) {
    throw new Error('Invoice not found');
  }

  const { invoice } = invoiceData;

  if (!invoice.stripe_invoice_id) {
    throw new Error('Invoice not synced to Stripe');
  }

  // Pay the Stripe invoice
  const stripeInvoice = await payInvoice(invoice.stripe_invoice_id);

  // Update our invoice status
  await supabase
    .from('invoices')
    .update({ status: stripeInvoice.status === 'paid' ? 'paid' : 'open' })
    .eq('id', invoiceId);

  // Extract payment intent and charge from Stripe invoice (cast to any for compatibility)
  const invoiceAny = stripeInvoice as any;
  const paymentIntentId = typeof invoiceAny.payment_intent === 'string' 
    ? invoiceAny.payment_intent 
    : invoiceAny.payment_intent?.id || null;
  const chargeId = typeof invoiceAny.charge === 'string'
    ? invoiceAny.charge
    : invoiceAny.charge?.id || null;

  // Create payment record
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      amount_cents: invoice.total_cents,
      currency: 'usd',
      status: stripeInvoice.status === 'paid' ? 'succeeded' : 'pending',
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      receipt_url: stripeInvoice.hosted_invoice_url,
      processed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !payment) {
    throw new Error(`Failed to create payment record: ${error?.message}`);
  }

  return payment as Payment;
}

// ==================== Payments ====================

/**
 * Get payments for an organization
 */
export async function getPayments(orgId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('organization_id', orgId)
    .order('processed_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payments: ${error.message}`);
  }

  return data as Payment[];
}

/**
 * Get all payments (admin)
 */
export async function getAllPayments(filters?: {
  status?: string;
  orgId?: string;
}): Promise<Payment[]> {
  let query = supabase.from('payments').select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.orgId) {
    query = query.eq('organization_id', filters.orgId);
  }

  const { data, error } = await query.order('processed_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payments: ${error.message}`);
  }

  return data as Payment[];
}

/**
 * Update payment status (used by webhooks)
 */
export async function updatePaymentStatus(
  paymentIntentId: string,
  status: Payment['status'],
  chargeId?: string,
  receiptUrl?: string
): Promise<void> {
  const updates: Partial<Payment> = { status };
  if (chargeId) updates.stripe_charge_id = chargeId;
  if (receiptUrl) updates.receipt_url = receiptUrl;

  await supabase
    .from('payments')
    .update(updates)
    .eq('stripe_payment_intent_id', paymentIntentId);
}

/**
 * Update invoice status (used by webhooks)
 */
export async function updateInvoiceStatus(
  stripeInvoiceId: string,
  status: Invoice['status']
): Promise<void> {
  await supabase
    .from('invoices')
    .update({ status })
    .eq('stripe_invoice_id', stripeInvoiceId);
}

// ==================== Billing Summary ====================

export interface BillingSummarySubscription {
  id: string;
  domain: string;
  mailboxCount: number;
  monthlyAmountCents: number;
  nextBillingDate: string;
  provider: 'google' | 'microsoft';
}

export interface UpcomingPayment {
  amountCents: number;
  date: string;
  mailboxCount: number;
}

export interface BillingSummary {
  subscriptions: BillingSummarySubscription[];
  upcomingPayments: UpcomingPayment[];
  totalMonthlyRecurring: number;
}

/**
 * Get billing summary for an organization
 * Returns active subscriptions and next payment info
 */
export async function getBillingSummary(orgId: string): Promise<BillingSummary> {
  // Get active subscriptions with their items
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select(`
      id,
      domain_id,
      next_billing_date,
      metadata,
      subscription_items (
        id,
        code,
        quantity,
        unit_price_cents
      )
    `)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('next_billing_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch subscriptions: ${error.message}`);
  }

  const result: BillingSummarySubscription[] = [];
  let totalMonthlyRecurring = 0;
  
  // Group payments by date
  const paymentsByDate = new Map<string, { amountCents: number; mailboxCount: number }>();

  for (const sub of subscriptions || []) {
    const items = (sub.subscription_items as any[]) || [];
    
    // Get domain name
    let domainName = 'Unknown';
    if (sub.domain_id) {
      const { data: domain } = await supabase
        .from('domains')
        .select('domain')
        .eq('id', sub.domain_id)
        .single();
      if (domain) {
        domainName = domain.domain;
      }
    } else if (sub.metadata?.domain) {
      domainName = sub.metadata.domain;
    }

    // Calculate totals for this subscription
    const mailboxCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const monthlyAmount = items.reduce((sum, item) => {
      return sum + ((item.unit_price_cents || 0) * (item.quantity || 0));
    }, 0);
    
    // Determine provider from item code (e.g., mailbox_monthly_google -> google)
    const firstItemCode = items[0]?.code || '';
    const provider: 'google' | 'microsoft' = firstItemCode.includes('microsoft') ? 'microsoft' : 'google';

    result.push({
      id: sub.id,
      domain: domainName,
      mailboxCount,
      monthlyAmountCents: monthlyAmount,
      nextBillingDate: sub.next_billing_date,
      provider,
    });

    totalMonthlyRecurring += monthlyAmount;

    // Aggregate by billing date
    const billingDate = sub.next_billing_date;
    if (billingDate) {
      const existing = paymentsByDate.get(billingDate);
      if (existing) {
        existing.amountCents += monthlyAmount;
        existing.mailboxCount += mailboxCount;
      } else {
        paymentsByDate.set(billingDate, { amountCents: monthlyAmount, mailboxCount });
      }
    }
  }

  // Convert to sorted array
  const upcomingPayments: UpcomingPayment[] = Array.from(paymentsByDate.entries())
    .map(([date, data]) => ({
      date,
      amountCents: data.amountCents,
      mailboxCount: data.mailboxCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    subscriptions: result,
    upcomingPayments,
    totalMonthlyRecurring,
  };
}

