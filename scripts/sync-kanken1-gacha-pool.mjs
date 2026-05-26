#!/usr/bin/env node
/**
 * 漢検1級ガチャ: 歩66 / 金25 / 艸3 / 閹3 / 膠3（合計100）のみ有効化
 * Usage: node scripts/sync-kanken1-gacha-pool.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

const KANKEN1_POOL = [
  ['kanken1', '歩', 66],
  ['kanken1', '金', 25],
  ['kanken1', '艸', 3],
  ['kanken1', '閹', 3],
  ['kanken1', '膠', 3],
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
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: gacha } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_id')
    .eq('gacha_code', 'kanken1')
    .single();

  const kanjiList = KANKEN1_POOL.map(([, k]) => k);
  const { data: pieces } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji')
    .in('kanji', kanjiList);

  const pieceByKanji = new Map((pieces ?? []).map((p) => [p.kanji, p.piece_id]));
  const planned = KANKEN1_POOL.map(([, kanji, weight]) => ({
    piece_id: pieceByKanji.get(kanji),
    kanji,
    weight,
  }));

  const { data: current } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select('piece_id,weight,is_active,m_piece:piece_id(kanji)')
    .eq('gacha_id', gacha.gacha_id);

  console.log('[current active]');
  for (const r of (current ?? []).filter((x) => x.is_active)) {
    const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
    console.log(`  ${p?.kanji} w=${r.weight}`);
  }
  console.log('[target]', planned.map((p) => `${p.kanji}=${p.weight}%`).join(', '));

  if (!shouldApply) {
    console.log('[dry-run] --apply to sync');
    return;
  }

  await supabase
    .schema('master')
    .from('m_gacha_piece')
    .update({ is_active: false })
    .eq('gacha_id', gacha.gacha_id);

  const rows = planned
    .filter((p) => p.piece_id)
    .map((p) => ({
      gacha_id: gacha.gacha_id,
      piece_id: p.piece_id,
      weight: p.weight,
      is_active: true,
    }));

  const { error } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .upsert(rows, { onConflict: 'gacha_id,piece_id' });
  if (error) throw error;

  console.log(`[ok] kanken1 pool synced (${rows.length} entries, total weight=100)`);
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
