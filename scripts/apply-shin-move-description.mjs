#!/usr/bin/env node
/**
 * 進の move_description_ja をリモート DB に反映
 * Usage: node scripts/apply-shin-move-description.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const shouldApply = process.argv.includes('--apply');
const TEXT = '移動範囲不明';
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

  const { data } = await supabase
    .schema('master')
    .from('m_piece')
    .select('kanji,name,move_description_ja')
    .eq('kanji', '進')
    .maybeSingle();

  console.log('[current]', data);

  if (!shouldApply) {
    console.log(`[dry-run] would set move_description_ja to: ${TEXT}`);
    return;
  }

  const { error } = await supabase
    .schema('master')
    .from('m_piece')
    .update({ move_description_ja: TEXT, updated_at: new Date().toISOString() })
    .eq('kanji', '進');

  if (error) throw error;
  console.log('[ok] updated 進');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
