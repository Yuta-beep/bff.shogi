#!/usr/bin/env node
/**
 * 4ガチャの重み付きプールを 20260525120000 migration 定義どおりに同期
 * Usage: node scripts/sync-all-gacha-pools.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

/** gacha_code, kanji, weight */
const POOLS = [
  ['hihen', '歩', 45],
  ['hihen', '金', 25],
  ['hihen', '灯', 15],
  ['hihen', '煽', 10],
  ['hihen', '爆', 5],
  ['ukanmuri', '歩', 45],
  ['ukanmuri', '金', 25],
  ['ukanmuri', '定', 10],
  ['ukanmuri', '安', 10],
  ['ukanmuri', '室', 7],
  ['ukanmuri', '宋', 3],
  ['shinnyo', '歩', 45],
  ['shinnyo', '金', 25],
  ['shinnyo', '辺', 7],
  ['shinnyo', '逸', 10],
  ['shinnyo', '進', 10],
  ['shinnyo', '逃', 3],
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

  const { data: gachas } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_id,gacha_code')
    .in('gacha_code', ['hihen', 'ukanmuri', 'shinnyo', 'kanken1']);

  const gachaByCode = new Map((gachas ?? []).map((g) => [g.gacha_code, g.gacha_id]));

  const kanjiSet = [...new Set(POOLS.map(([, k]) => k))];
  const { data: pieces } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji')
    .in('kanji', kanjiSet);
  const pieceByKanji = new Map((pieces ?? []).map((p) => [p.kanji, p.piece_id]));

  for (const code of ['hihen', 'ukanmuri', 'shinnyo', 'kanken1']) {
    const gachaId = gachaByCode.get(code);
    const pool = POOLS.filter(([c]) => c === code);
    console.log(`\n[${code}] target:`, pool.map(([, k, w]) => `${k}${w}`).join(', '));

    const { data: current } = await supabase
      .schema('master')
      .from('m_gacha_piece')
      .select('weight,is_active,m_piece:piece_id(kanji)')
      .eq('gacha_id', gachaId)
      .eq('is_active', true);
    console.log(
      `[${code}] current:`,
      (current ?? []).map((r) => {
        const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
        return `${p?.kanji}w${r.weight}`;
      }).join(', ') || '(empty)',
    );
  }

  if (!shouldApply) {
    console.log('\n[dry-run] --apply to sync all pools');
    return;
  }

  for (const code of ['hihen', 'ukanmuri', 'shinnyo', 'kanken1']) {
    const gachaId = gachaByCode.get(code);
    await supabase.schema('master').from('m_gacha_piece').update({ is_active: false }).eq('gacha_id', gachaId);

    const rows = POOLS.filter(([c]) => c === code)
      .map(([, kanji, weight]) => ({
        gacha_id: gachaId,
        piece_id: pieceByKanji.get(kanji),
        weight,
        is_active: true,
      }))
      .filter((r) => r.piece_id);

    await supabase.schema('master').from('m_gacha_piece').upsert(rows, { onConflict: 'gacha_id,piece_id' });
    console.log(`[ok] ${code}: ${rows.length} entries`);
  }
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
