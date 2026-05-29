#!/usr/bin/env node
/**
 * しんにょうガチャの重み付きプールを 20260525120000 migration と同期
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

const SHINNYO_POOL = [
  ['shinnyo', '歩', 45],
  ['shinnyo', '金', 25],
  ['shinnyo', '辺', 7],
  ['shinnyo', '逸', 10],
  ['shinnyo', '進', 10],
  ['shinnyo', '逃', 3],
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
    .eq('gacha_code', 'shinnyo')
    .single();

  const kanjiList = SHINNYO_POOL.map(([, k]) => k);
  const { data: pieces } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name')
    .in('kanji', kanjiList);

  const pieceByKanji = new Map((pieces ?? []).map((p) => [p.kanji, p]));
  const planned = SHINNYO_POOL.map(([, kanji, weight]) => ({
    piece_id: pieceByKanji.get(kanji).piece_id,
    kanji,
    weight,
  }));

  const { data: current } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select('weight,is_active,m_piece:piece_id(kanji)')
    .eq('gacha_id', gacha.gacha_id)
    .eq('is_active', true);

  console.log(
    '[current]',
    (current ?? []).map((r) => {
      const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
      return `${p?.kanji} w=${r.weight}`;
    }),
  );
  console.log('[target]', planned.map((p) => `${p.kanji} w=${p.weight}`).join(', '));

  if (!shouldApply) {
    console.log('[dry-run] --apply to sync');
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

  await supabase
    .schema('master')
    .from('m_gacha_piece')
    .upsert(rows, { onConflict: 'gacha_id,piece_id' });
  console.log('[ok] shinnyo pool synced (辺 weight=7)');
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
