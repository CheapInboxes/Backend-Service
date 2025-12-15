import { supabase } from '../clients/infrastructure/supabase.js';
import { Organization, OrganizationMember } from '../types/index.js';

export async function createOrganization(
  name: string,
  billingEmail: string,
  userId: string
): Promise<{ organization: Organization; membership: OrganizationMember }> {
  // Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name,
      billing_email: billingEmail,
      stripe_customer_id: '', // Placeholder, will be set when Stripe customer is created
      status: 'active',
    })
    .select()
    .single();

  if (orgError || !org) {
    throw new Error(`Failed to create organization: ${orgError?.message || 'Unknown error'}`);
  }

  // Create owner membership
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })
    .select()
    .single();

  if (membershipError || !membership) {
    // Rollback: delete org if membership creation fails
    await supabase.from('organizations').delete().eq('id', org.id);
    throw new Error(
      `Failed to create membership: ${membershipError?.message || 'Unknown error'}`
    );
  }

  // Write audit log (non-blocking - don't fail org creation if audit log fails)
  const { error: auditError } = await supabase.from('audit_log').insert({
    organization_id: org.id,
    actor_user_id: userId,
    action: 'org.create',
    target_type: 'organization',
    target_id: org.id,
    metadata: {
      name,
      billing_email: billingEmail,
    },
  });

  if (auditError) {
    // Log but don't throw - audit log failure shouldn't break org creation
    console.warn('Failed to write audit log:', auditError.message);
  }

  return {
    organization: org as Organization,
    membership: membership as OrganizationMember,
  };
}

export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const { data: memberships, error } = await supabase
    .from('organization_members')
    .select('organizations(*)')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch organizations: ${error.message}`);
  }

  return (memberships || []).map((m: any) => m.organizations as unknown as Organization);
}

export async function getOrganization(
  orgId: string,
  userId: string
): Promise<{ organization: Organization; role: string }> {
  // Validate membership and get role
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role, organizations(*)')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (membershipError || !membership) {
    throw new Error('Organization not found or user is not a member');
  }

  return {
    organization: (membership as any).organizations as unknown as Organization,
    role: membership.role,
  };
}

export async function validateMembership(orgId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}

