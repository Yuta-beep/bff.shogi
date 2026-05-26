#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const code = process.argv[2] ?? 'hihen';
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

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: gacha } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_id,gacha_code')
    .eq('gacha_code', code)
    .single();

  const { data: rows } = await supabase
    .schema('master')
    .from('m_gacha_piece')
    .select('weight,is_active,m_piece:piece_id(kanji,name)')
    .eq('gacha_id', gacha.gacha_id)
    .eq('is_active', true);

  const items = (rows ?? []).map((r) => {
    const p = Array.isArray(r.m_piece) ? r.m_piece[0] : r.m_piece;
    return { kanji: p?.kanji, weight: r.weight };
  });
  const total = items.reduce((s, i) => s + i.weight, 0);
  console.log(`[${code}] pool (total weight=${total}):`);
  for (const i of items) {
    console.log(`  ${i.kanji}: ${i.weight} (${((i.weight / total) * 100).toFixed(1)}%)`);
  }
}

main();
