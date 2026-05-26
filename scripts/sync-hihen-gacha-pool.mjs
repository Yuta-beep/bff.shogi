#!/usr/bin/env node
/**
 * ひへんガチャの重み付きプールを gacha_room.html / 20260525120000 migration と同期
 * Usage: node scripts/sync-hihen-gacha-pool.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

/** gacha_code, kanji, weight */
const HIHEN_POOL = [
  ['hihen', '歩', 45],
  ['hihen', '金', 25],
  ['hihen', '灯', 15],
  ['hihen', '煽', 10],
  ['hihen', '爆', 5],
];

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
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: gacha, error: gachaError } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_id,gacha_code')
    .eq('gacha_code', 'hihen')
    .single();
  if (gachaError || !gacha) throw new Error('hihen gacha not found');

  const kanjiList = [...new Set(HIHEN_POOL.map(([, k]) => k))];
  const { data: pieces, error: pieceError } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name')
    .in('kanji', kanjiList);
  if (pieceError) throw pieceError;

  const pieceByKanji = new Map((pieces ?? []).map((p) => [p.kanji, p]));
  const planned = [];
  for (const [, kanji, weight] of HIHEN_POOL) {
    const p = pieceByKanji.get(kanji);
    if (!p) {
      console.warn(`[warn] m_piece missing: ${kanji}`);
      continue;
    }
    planned.push({ piece_id: p.piece_id, kanji, name: p.name, weight });
  }

  console.log('[plan] hihen pool:');
  for (const row of planned) {
    console.log(`  ${row.kanji} (${row.name}) weight=${row.weight}`);
  }

  const { data: current } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select('piece_id,weight,is_active,m_piece:piece_id(kanji)')
    .eq('gacha_id', gacha.gacha_id);

  console.log('[current pool]', (current ?? []).map((r) => {
    const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
    return `${p?.kanji ?? '?'} w=${r.weight} active=${r.is_active}`;
  }));

  if (!shouldApply) {
    console.log('[dry-run] Re-run with --apply');
    return;
  }

  await supabase
    .schema('master')
    .from('m_gacha_piece')
    .update({ is_active: false })
    .eq('gacha_id', gacha.gacha_id);

  const rows = planned.map((p) => ({
    gacha_id: gacha.gacha_id,
    piece_id: p.piece_id,
    weight: p.weight,
    is_active: true,
  }));

  const { error: upsertError } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .upsert(rows, { onConflict: 'gacha_id,piece_id' });
  if (upsertError) throw upsertError;

  console.log(`[ok] Synced ${rows.length} hihen pool entries (灯 weight=15)`);
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
