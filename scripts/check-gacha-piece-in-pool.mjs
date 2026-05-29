#!/usr/bin/env node
/**
 * 指定漢字がガチャプールに含まれるか確認
 * Usage: node scripts/check-gacha-piece-in-pool.mjs 灯
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const kanji = process.argv[2] ?? '灯';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

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
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: piece, error: pieceError } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name,piece_code,rarity,is_active,published_at,unpublished_at')
    .eq('kanji', kanji)
    .maybeSingle();
  if (pieceError) throw pieceError;

  if (!piece) {
    console.log(`[ng] m_piece に「${kanji}」が未登録`);
    process.exitCode = 1;
    return;
  }

  console.log('[piece]', piece);
  console.log(`  図鑑公開: ${isPublishedNow(piece)}`);

  const { data: pools, error: poolError } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select(
      'gacha_id,weight,is_active,m_gacha:gacha_id(gacha_code,gacha_name,is_active,published_at,unpublished_at)',
    )
    .eq('piece_id', piece.piece_id);
  if (poolError) throw poolError;

  const activePools = (pools ?? []).filter((row) => {
    const g = Array.isArray(row.m_gacha) ? row.m_gacha[0] : row.m_gacha;
    return row.is_active && g && isPublishedNow(g);
  });

  if (activePools.length === 0) {
    console.log(`[ng] 公開中のガチャプールに「${kanji}」は含まれていません`);
    console.log('[raw pools]', pools);
    process.exitCode = 1;
    return;
  }

  console.log(`[ok] 「${kanji}」は次のガチャから排出可能です:`);
  for (const row of activePools) {
    const g = Array.isArray(row.m_gacha) ? row.m_gacha[0] : row.m_gacha;
    const totalHint = g.gacha_code === 'hihen' ? ' (ひへん: 歩45+金25+灯15+煽10+爆5=100)' : '';
    console.log(`  - ${g.gacha_code} (${g.gacha_name}) weight=${row.weight}${totalHint}`);
  }
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
