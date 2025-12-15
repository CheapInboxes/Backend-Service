import { supabase, supabaseAnon } from '../clients/infrastructure/supabase.js';
import { User, Organization } from '../types/index.js';

export async function syncUser(
  userId: string,
  email: string,
  name?: string
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        email,
        name: name || null,
      },
      {
        onConflict: 'id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to sync user: ${error.message}`);
  }

  return data as User;
}

export async function getUserWithOrgs(userId: string): Promise<{
  user: User;
  organizations: Array<Organization & { role: string }>;
}> {
  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error(`User not found: ${userError?.message || 'Unknown error'}`);
  }

  // Get organizations via memberships
  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_members')
    .select('role, organizations(*)')
    .eq('user_id', userId);

  if (membershipsError) {
    throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
  }

  const organizations = (memberships || []).map((m: any) => ({
    ...(m.organizations as unknown as Organization),
    role: m.role,
  }));

  return {
    user: user as User,
    organizations,
  };
}

export async function signUp(
  email: string,
  password: string,
  name?: string
): Promise<{ user: User; access_token: string; refresh_token: string }> {
  // Use admin API (service role) to create user - bypasses email confirmation
  // This is appropriate for backend API signup
  const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email for backend signup
    user_metadata: {
      name: name || null,
    },
  });

  if (adminError || !adminData.user) {
    throw new Error(`Signup failed: ${adminError?.message || 'Unknown error'}`);
  }

  // Sync user to users table
  const user = await syncUser(adminData.user.id, email, name);

  // Now sign in with anon key to get session tokens for the user
  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to create session: ${signInError?.message || 'Unknown error'}`);
  }

  return {
    user,
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  };
}

export async function signIn(
  email: string,
  password: string
): Promise<{ user: User; access_token: string; refresh_token: string }> {
  // Sign in user via Supabase Auth
  const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user || !authData.session) {
    throw new Error(`Login failed: ${authError?.message || 'Invalid credentials'}`);
  }

  // Sync user to users table (in case they don't exist yet)
  const user = await syncUser(authData.user.id, email, authData.user.user_metadata?.name);

  return {
    user,
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  };
}

export async function signOut(accessToken: string): Promise<void> {
  // Set the session for the anon client
  const { error } = await supabaseAnon.auth.setSession({
    access_token: accessToken,
    refresh_token: '', // Not needed for sign out
  });

  if (error) {
    throw new Error(`Failed to set session: ${error.message}`);
  }

  // Sign out
  const { error: signOutError } = await supabaseAnon.auth.signOut();

  if (signOutError) {
    throw new Error(`Signout failed: ${signOutError.message}`);
  }
}

