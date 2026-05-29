#!/usr/bin/env node
/**
 * 駒図鑑のファイル名に合わせて image_key を更新し、Storage に再アップロードする。
 * Usage: node scripts/apply-piece-catalog-image-keys.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const shouldApply = process.argv.includes('--apply');

const FILENAME_OVERRIDES = {
  歩: '歩兵.png',
  香: '香車.png',
  桂: '桂馬.png',
  銀: '銀将.png',
  金: '金将.png',
  玉: '王将.png',
  王: '王将.png',
  角: '角行.png',
  飛: '飛車.png',
  爆: '爆.png',
  灯: '灯.png',
  走: '走.png',
  種: '種.png',
  麒: '麒.png',
  舞: '舞.png',
  P: 'P.png',
  鳴: '鳴.png',
};

const SHOP_IMAGE_BY_KANJI = {
  走: '駒ショップ「走」.png',
  種: '駒ショップ「種」.png',
  麒: '駒ショップ「麒」.png',
  舞: '駒ショップ「舞」.png',
  P: '駒ショップ「P」.png',
  鳴: '駒ショップ「鳴」.png',
};

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

function getShogiRoot() {
  for (const c of [
    path.resolve(backendRoot, '../shogi_game'),
    path.resolve(backendRoot, '../../shogi_game'),
  ]) {
    if (fs.existsSync(path.join(c, 'piece_info.html'))) return c;
  }
  return null;
}

function resolveImage(entry, shogiRoot) {
  const candidates = [];
  if (SHOP_IMAGE_BY_KANJI[entry.kanji]) candidates.push(SHOP_IMAGE_BY_KANJI[entry.kanji]);
  if (FILENAME_OVERRIDES[entry.kanji]) candidates.push(FILENAME_OVERRIDES[entry.kanji]);
  if (entry.name) candidates.push(`${entry.name}.png`);
  candidates.push(`${entry.kanji}.png`);

  for (const fileName of candidates) {
    const fullPath = path.join(shogiRoot, fileName);
    if (fs.existsSync(fullPath)) {
      return {
        fileName,
        fullPath,
        imageKey: `pieces/piece-${entry.pieceId}.png`,
      };
    }
  }
  return null;
}

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const shogiRoot = getShogiRoot();
  if (!shogiRoot) throw new Error('shogi_game not found');

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: pieces, error } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name,image_key,unpublished_at');
  if (error) throw error;

  const seedSql = fs.readFileSync(
    path.resolve(backendRoot, 'scripts/generated/seed_master_piece.sql'),
    'utf8',
  );
  const unlockByKanji = new Map();
  for (const m of seedSql.matchAll(
    /\('piece_[^']+',\s*'([^']+)',\s*'([^']+)',\s*'[^']+',\s*NULL\)/g,
  )) {
    unlockByKanji.set(m[1], null);
  }
  for (const row of [
    ['走', 'ショップ'],
    ['種', 'ショップ'],
    ['麒', 'ショップ'],
    ['舞', 'ショップ'],
    ['P', 'ショップ'],
    ['鳴', 'ショップ'],
    ['爆', 'ガチャ'],
    ['灯', 'ガチャ'],
    ['煽', 'ガチャ'],
    ['宋', 'ガチャ'],
    ['艸', 'ガチャ'],
    ['閹', 'ガチャ'],
    ['膠', 'ガチャ'],
  ]) {
    unlockByKanji.set(row[0], row[1]);
  }

  const planned = [];
  for (const row of pieces ?? []) {
    const file = resolveImage(
      {
        kanji: row.kanji,
        name: row.name,
        unlock: unlockByKanji.get(row.kanji),
        pieceId: row.piece_id,
      },
      shogiRoot,
    );
    if (!file) continue;
    if (row.image_key === file.imageKey) continue;
    planned.push({ ...row, ...file });
  }

  console.log(`[info] Image key updates: ${planned.length}`);
  if (planned.length > 0)
    console.table(planned.slice(0, 15).map((p) => ({ kanji: p.kanji, image_key: p.imageKey })));

  if (!shouldApply) {
    console.log('[dry-run] Re-run with --apply');
    return;
  }

  let updated = 0;
  for (const item of planned) {
    const binary = fs.readFileSync(item.fullPath);
    const { error: uploadError } = await supabase.storage
      .from('piece-images')
      .upload(item.imageKey, binary, { upsert: true, contentType: 'image/png' });
    if (uploadError) throw uploadError;

    const { error: patchError } = await supabase
      .schema('master')
      .from('m_piece')
      .update({
        image_source: 'supabase',
        image_bucket: 'piece-images',
        image_key: item.imageKey,
        is_active: true,
        unpublished_at: null,
      })
      .eq('piece_id', item.piece_id);
    if (patchError) throw patchError;
    updated += 1;
  }

  console.log(`[ok] Updated ${updated} piece image keys and storage objects.`);
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exitCode = 1;
});
