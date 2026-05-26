#!/usr/bin/env node
/**
 * ガチャ1回の消費通貨をリモート DB に反映
 * Usage: node scripts/apply-gacha-roll-costs.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const shouldApply = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const TARGET = {
  ukanmuri: { pawn_cost: 10, gold_cost: 0 },
  hihen: { pawn_cost: 10, gold_cost: 0 },
  shinnyo: { pawn_cost: 10, gold_cost: 0 },
  kanken1: { pawn_cost: 0, gold_cost: 2 },
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

async function main() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error: fetchError } = await supabase
    .schema('master')
    .from('m_gacha')
    .select('gacha_code,pawn_cost,gold_cost')
    .in('gacha_code', Object.keys(TARGET));
  if (fetchError) throw fetchError;

  console.log('[current]', data);

  if (!shouldApply) {
    console.log('[dry-run] would set costs:', TARGET);
    return;
  }

  for (const [code, costs] of Object.entries(TARGET)) {
    const { error } = await supabase
      .schema('master')
      .from('m_gacha')
      .update({ ...costs, updated_at: new Date().toISOString() })
      .eq('gacha_code', code);
    if (error) throw error;
    console.log(`[ok] ${code} pawn=${costs.pawn_cost} gold=${costs.gold_cost}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
