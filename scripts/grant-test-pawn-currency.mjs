#!/usr/bin/env node
/**
 * テスト用に歩通貨を付与
 * Usage:
 *   node scripts/grant-test-pawn-currency.mjs --apply
 *   node scripts/grant-test-pawn-currency.mjs --apply --amount=1000
 *   node scripts/grant-test-pawn-currency.mjs --apply --player-id=<uuid>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const shouldApply = process.argv.includes('--apply');
const amountArg = process.argv.find((a) => a.startsWith('--amount='));
const playerIdArg = process.argv.find((a) => a.startsWith('--player-id='));
const amount = amountArg ? Number(amountArg.split('=')[1]) : 1000;
const playerId = playerIdArg ? playerIdArg.split('=')[1] : null;

if (!Number.isFinite(amount) || amount <= 0) {
  console.error('[error] --amount must be a positive number');
  process.exitCode = 1;
  process.exit();
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from('players')
    .select('id,display_name,pawn_currency,gold_currency')
    .order('updated_at', { ascending: false });
  if (playerId) query = query.eq('id', playerId);

  const { data: players, error: loadError } = await query;
  if (loadError) throw loadError;
  if (!players?.length) {
    console.log('[info] No players found');
    return;
  }

  console.log(`[plan] Add pawn_currency +${amount} to ${players.length} player(s):`);
  for (const p of players) {
    console.log(
      `  ${p.id.slice(0, 8)}… ${p.display_name ?? '(no name)'}: ${p.pawn_currency} → ${p.pawn_currency + amount}`,
    );
  }

  if (!shouldApply) {
    console.log('[dry-run] Re-run with --apply');
    return;
  }

  for (const p of players) {
    const { error } = await supabase
      .from('players')
      .update({
        pawn_currency: p.pawn_currency + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);
    if (error) throw error;
  }

  console.log(`[ok] Granted +${amount} pawn currency to ${players.length} player(s).`);
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
