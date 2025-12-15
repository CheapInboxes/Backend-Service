// Database entity types (matching Supabase schema)
export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  billing_email: string;
  stripe_customer_id: string;
  status: 'active' | 'trialing' | 'suspended';
  timezone: string;
  currency: string;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

// Auth types
export interface AuthUser {
  id: string;
  email: string;
}

// API response types
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface CreateOrgRequest {
  name: string;
  billingEmail: string;
}

export interface CreateOrgResponse {
  organization: Organization;
  membership: OrganizationMember;
}

export interface GetMeResponse {
  user: User;
  organizations: Array<Organization & { role: string }>;
}

export interface GetOrgResponse {
  organization: Organization;
  role: string;
}

// Auth request/response types
export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
}

export interface SignUpResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  access_token: string;
  refresh_token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  access_token: string;
  refresh_token: string;
}

export interface LogoutRequest {
  access_token: string;
}

// Domain types
export interface Domain {
  id: string;
  organization_id: string;
  domain: string;
  status: 'pending' | 'provisioning' | 'ready' | 'error' | 'suspended' | 'expired';
  source_provider: string;
  tags: string[];
  external_refs: Record<string, any>;
  auto_renew: boolean;
  next_renewal_date: string | null;
  created_at: string;
}

export interface DomainRun {
  id: string;
  organization_id: string;
  domain_id: string;
  initiated_by_user_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: string;
}

export interface CreateDomainRequest {
  domain: string;
  source_provider: string;
  tags?: string[];
  auto_renew?: boolean;
}

export interface CreateDomainResponse {
  domain: Domain;
  run: DomainRun;
}

// Mailbox types
export interface Mailbox {
  id: string;
  organization_id: string;
  domain_id: string;
  full_email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  status: 'provisioning' | 'active' | 'paused' | 'error' | 'deleted';
  source_provider: string;
  external_refs: Record<string, any>;
  daily_limit: number;
  created_at: string;
}

export interface MailboxRun {
  id: string;
  organization_id: string;
  domain_id: string;
  mailbox_id: string | null;
  initiated_by_user_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: string;
}

export interface CreateMailboxesRequest {
  domain_id: string;
  count: number;
  first_name_pattern?: string;
  last_name_pattern?: string;
}

export interface CreateMailboxesResponse {
  mailboxes: Mailbox[];
  runs: MailboxRun[];
}

// Usage Events & Billing types
export interface UsageEvent {
  id: string;
  organization_id: string;
  code: string;
  quantity: number;
  effective_at: string;
  created_at: string;
  related_ids: Record<string, any>;
}

export interface CreateUsageEventRequest {
  code: string;
  quantity: number;
  effective_at?: string;
  related_ids?: Record<string, any>;
}

export interface CreateUsageEventResponse {
  event: UsageEvent;
}

// Pricing Rule Condition types
export type PricingRuleConditionType = 
  | 'organization' 
  | 'pricebook_item' 
  | 'max_uses' 
  | 'min_quantity' 
  | 'date_range' 
  | 'org_segment';

export type PricingRuleConditionOperator = 
  | 'in' 
  | 'not_in' 
  | 'eq' 
  | 'neq' 
  | 'gte' 
  | 'lte' 
  | 'between';

export interface PricingRuleCondition {
  id: string;
  pricing_rule_id: string;
  condition_type: PricingRuleConditionType;
  operator: PricingRuleConditionOperator;
  value: Record<string, any>;
  group_id: number;
  created_at?: string;
}

export interface PricingRuleUsage {
  id: string;
  pricing_rule_id: string;
  organization_id: string | null;
  pricebook_item_id: string | null;
  usage_count: number;
}

// Extended PricingRule with conditions
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

export interface PricingRuleWithConditions extends PricingRule {
  conditions: PricingRuleCondition[];
}

