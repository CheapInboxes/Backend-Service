/**
 * One-time script to create the first founder user
 * Run with: npx tsx scripts/create-founder.ts <email> <password> <name>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createFounder(email: string, password: string, name: string) {
  console.log(`Creating founder user: ${email}...`);

  // Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
    },
  });

  if (authError || !authUser.user) {
    console.error('Failed to create auth user:', authError?.message);
    process.exit(1);
  }

  console.log(`✓ Created auth user: ${authUser.user.id}`);

  // Sync to users table
  const { error: userSyncError } = await supabase
    .from('users')
    .upsert({
      id: authUser.user.id,
      email,
      name,
    });

  if (userSyncError) {
    console.error('Failed to sync to users table:', userSyncError.message);
    // Continue anyway
  } else {
    console.log('✓ Synced to users table');
  }

  // Create internal user record
  const { data: internalUser, error: internalError } = await supabase
    .from('internal_users')
    .insert({
      user_id: authUser.user.id,
      email,
      name,
      role: 'founder',
    })
    .select()
    .single();

  if (internalError || !internalUser) {
    console.error('Failed to create internal user:', internalError?.message);
    // Rollback auth user
    await supabase.auth.admin.deleteUser(authUser.user.id);
    process.exit(1);
  }

  console.log(`✓ Created internal user with founder role`);
  console.log(`\nFounder user created successfully!`);
  console.log(`Email: ${email}`);
  console.log(`User ID: ${authUser.user.id}`);
  console.log(`Internal User ID: ${internalUser.id}`);
}

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Founder';

if (!email || !password) {
  console.error('Usage: npx tsx scripts/create-founder.ts <email> <password> [name]');
  process.exit(1);
}

createFounder(email, password, name).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

