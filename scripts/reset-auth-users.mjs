#!/usr/bin/env node
/**
 * 開発用: auth.users と関連レコードを削除するリセットスクリプト。
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

function printSupabaseError(prefix, error) {
  if (!error) return;
  console.error(`${prefix}: ${error.message}`);
  if (error.code) console.error(`    code: ${error.code}`);
  if (error.details) console.error(`    details: ${error.details}`);
  if (error.hint) console.error(`    hint: ${error.hint}`);
}

async function countPlayerGames(supabase, userId) {
  const { count, error } = await supabase
    .schema('game')
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', userId);

  return { count: count ?? 0, error };
}

async function deletePlayerGames(supabase, userId) {
  const { error } = await supabase.schema('game').from('games').delete().eq('player_id', userId);

  return { error };
}

async function main() {
  const supabase = createAdminClient();

  const { data, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const users = data.users;
  console.log(`Found ${users.length} user(s)`);

  for (const user of users) {
    const label = user.is_anonymous ? 'anonymous' : (user.email ?? user.id);
    const { count, error } = await countPlayerGames(supabase, user.id);
    if (error) {
      console.log(`  - ${user.id}  (${label}) [game.games: unknown]`);
      printSupabaseError('    game.games count failed', error);
    } else {
      console.log(`  - ${user.id}  (${label}) [game.games: ${count}]`);
    }
  }

  if (!shouldApply) {
    console.log('\nDry run. Pass --apply to actually delete.');
    return;
  }

  let deleted = 0;

  for (const user of users) {
    const { error: gameDeleteError } = await deletePlayerGames(supabase, user.id);
    if (gameDeleteError) {
      printSupabaseError(`  ! cleanup failed for game.games user=${user.id}`, gameDeleteError);
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      printSupabaseError(`  ✗ ${user.id}`, error);
    } else {
      console.log(`  ✓ deleted ${user.id}`);
      deleted += 1;
    }
  }

  console.log(`\nDeleted ${deleted}/${users.length} user(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
