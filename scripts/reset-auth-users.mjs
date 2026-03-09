#!/usr/bin/env node
/**
 * 開発用: auth.users と public.players を全削除するリセットスクリプト。
 * players は auth.users の CASCADE DELETE で自動的に削除される。
 *
 * Usage:
 *   node scripts/reset-auth-users.mjs          # dry run（一覧表示のみ）
 *   node scripts/reset-auth-users.mjs --apply  # 実際に削除
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const shouldApply = process.argv.includes('--apply');

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL in env');
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in env');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const supabase = createAdminClient();

  const { data, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const users = data.users;
  console.log(`Found ${users.length} user(s)`);
  users.forEach((u) => {
    const label = u.is_anonymous ? 'anonymous' : (u.email ?? u.id);
    console.log(`  - ${u.id}  (${label})`);
  });

  if (!shouldApply) {
    console.log('\nDry run. Pass --apply to actually delete.');
    return;
  }

  let deleted = 0;
  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`  ✗ ${user.id}: ${error.message}`);
    } else {
      console.log(`  ✓ deleted ${user.id}`);
      deleted++;
    }
  }

  console.log(`\nDeleted ${deleted}/${users.length} user(s). players rows cascade-deleted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
