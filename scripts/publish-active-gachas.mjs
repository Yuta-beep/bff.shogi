#!/usr/bin/env node
/**
 * 4種ガチャを公開状態にする（unpublished_at 期限切れの解消）
 * Usage: node scripts/publish-active-gachas.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

const GACHA_CODES = ['hihen', 'ukanmuri', 'shinnyo', 'kanken1'];

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

function isPublishedNow(row, now = new Date()) {
  if (row.is_active === false) return false;
  const publishedAt = row.published_at ? new Date(row.published_at) : null;
  const unpublishedAt = row.unpublished_at ? new Date(row.unpublished_at) : null;
  if (publishedAt && now < publishedAt) return false;
  if (unpublishedAt && now >= unpublishedAt) return false;
  return true;
}

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: before, error: loadError } = await supabase
    .schema('master')
    .from('m_gacha')
    .select(
      'gacha_id,gacha_code,gacha_name,is_active,published_at,unpublished_at,pawn_cost,gold_cost',
    )
    .in('gacha_code', GACHA_CODES);
  if (loadError) throw loadError;

  console.log('[before]');
  for (const row of before ?? []) {
    console.log(
      `  ${row.gacha_code}: active=${row.is_active} published=${row.published_at} unpublished=${row.unpublished_at} available=${isPublishedNow(row)} pawn=${row.pawn_cost} gold=${row.gold_cost}`,
    );
  }

  if (!shouldApply) {
    console.log('[dry-run] Re-run with --apply to publish gachas');
    return;
  }

  const { error: updateError } = await supabase
    .schema('master')
    .from('m_gacha')
    .update({
      is_active: true,
      unpublished_at: null,
      published_at: new Date().toISOString(),
    })
    .in('gacha_code', GACHA_CODES);
  if (updateError) throw updateError;

  const gachaIds = (before ?? []).map((r) => r.gacha_id);
  let pieceCount = 0;
  if (gachaIds.length > 0) {
    const { data: pieceRows, error: pieceError } = await supabase
      .schema('master')
      .from('m_gacha_piece')
      .update({ is_active: true })
      .in('gacha_id', gachaIds)
      .select('gacha_id');
    if (pieceError) throw pieceError;
    pieceCount = pieceRows?.length ?? 0;
  }

  const { data: after } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_code,unpublished_at,is_active')
    .in('gacha_code', GACHA_CODES);

  console.log(
    `[ok] Published ${GACHA_CODES.length} gachas, reactivated gacha_piece rows: ${pieceCount ?? '?'}`,
  );
  console.log('[after]', after);
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
