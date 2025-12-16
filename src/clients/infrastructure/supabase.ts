import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

// Service-role client for admin operations
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Anon client for auth operations (signup/login)
const supabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export { supabase, supabaseAnon };







