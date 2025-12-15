import { supabase } from '../clients/infrastructure/supabase.js';

export interface InternalUser {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: 'support' | 'ops' | 'billing' | 'admin' | 'founder';
  created_at: string;
  deactivated_at: string | null;
}

// Role default permissions
const ROLE_DEFAULTS: Record<string, string[]> = {
  support: [
    'view:organizations',
    'view:domains',
    'view:mailboxes',
    'view:invoices',
    'view:audit_log',
  ],
  ops: [
    'view:organizations',
    'view:domains',
    'view:mailboxes',
    'view:invoices',
    'view:audit_log',
    'retry:domains',
    'retry:mailboxes',
    'impersonate:organizations',
  ],
  billing: [
    'view:organizations',
    'view:domains',
    'view:mailboxes',
    'view:invoices',
    'view:audit_log',
    'view:pricebook',
    'manage:invoices',
    'manage:pricing_rules',
  ],
  admin: [
    'view:organizations',
    'view:domains',
    'view:mailboxes',
    'view:invoices',
    'view:audit_log',
    'view:pricebook',
    'retry:domains',
    'retry:mailboxes',
    'impersonate:organizations',
    'manage:invoices',
    'manage:pricebook',
    'manage:pricing_rules',
    'process:payments',
    'view:internal_users',
  ],
  founder: ['superadmin'], // Bypasses all checks
};

/**
 * Get internal user by auth.users.id
 */
export async function getInternalUser(userId: string): Promise<InternalUser | null> {
  const { data, error } = await supabase
    .from('internal_users')
    .select('*')
    .eq('user_id', userId)
    .is('deactivated_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  return data as InternalUser;
}

/**
 * Get all permissions for an internal user (role defaults + explicit grants)
 */
export async function getUserPermissions(internalUserId: string): Promise<string[]> {
  const { data: user } = await supabase
    .from('internal_users')
    .select('role')
    .eq('id', internalUserId)
    .single();

  if (!user) {
    return [];
  }

  // Get role defaults
  const roleDefaults = ROLE_DEFAULTS[user.role] || [];

  // Get explicit permissions
  const { data: explicitPerms } = await supabase
    .from('internal_user_permissions')
    .select('permission')
    .eq('internal_user_id', internalUserId);

  const explicit = (explicitPerms || []).map((p) => p.permission);

  // Combine and dedupe
  return Array.from(new Set([...roleDefaults, ...explicit]));
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const internalUser = await getInternalUser(userId);
  if (!internalUser) {
    return false;
  }

  // Superadmin bypasses everything
  const allPerms = await getUserPermissions(internalUser.id);
  if (allPerms.includes('superadmin')) {
    return true;
  }

  return allPerms.includes(permission);
}

/**
 * Get role defaults for a role
 */
export function getRoleDefaults(role: string): string[] {
  return ROLE_DEFAULTS[role] || [];
}


