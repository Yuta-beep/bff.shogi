#!/usr/bin/env node
/**
 * BFF と同じプール・重みで抽選シミュレーション
 * Usage: node scripts/simulate-gacha-rolls.mjs hihen 200
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const gachaCode = process.argv[2] ?? 'hihen';
const trials = Number(process.argv[3] ?? 200);
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

function isCurrency(char) {
  return char === '歩' || char === '金';
}

function pickWeightedRandom(items, getWeight) {
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, getWeight(item));
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: gacha } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_id,gacha_code')
    .eq('gacha_code', gachaCode)
    .single();

  const { data: rows } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select('weight,is_active,m_piece:piece_id(kanji,name)')
    .eq('gacha_id', gacha.gacha_id)
    .eq('is_active', true);

  const pieces = (rows ?? [])
    .map((r) => {
      const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
      return { char: p?.kanji, name: p?.name, weight: r.weight };
    })
    .filter((p) => p.char);

  console.log(`[pool] ${gachaCode} active pieces:`, pieces);

  let currency = 0;
  let hit = 0;
  for (let i = 0; i < trials; i += 1) {
    const picked = pickWeightedRandom(pieces, (p) => p.weight);
    if (isCurrency(picked.char)) currency += 1;
    else hit += 1;
  }

  console.log(
    `[sim] ${trials} rolls: currency=${currency} (${((currency / trials) * 100).toFixed(1)}%) piece=${hit}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
