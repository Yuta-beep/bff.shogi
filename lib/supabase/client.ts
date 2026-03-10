import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isTestLike = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

const resolvedSupabaseUrl = supabaseUrl ?? (isTestLike ? 'http://127.0.0.1:54321' : undefined);
const resolvedServiceRoleKey =
  serviceRoleKey ?? (isTestLike ? 'dummy-service-role-key' : undefined);

if (!resolvedSupabaseUrl) {
  throw new Error('Missing SUPABASE URL. Set EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL.');
}

if (!resolvedServiceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
