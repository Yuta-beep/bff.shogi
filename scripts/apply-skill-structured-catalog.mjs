#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
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

function loadLocalEnv() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  loadEnvFile(path.resolve(backendRoot, '.env.local'));
}

function baseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL in env');
  return url.replace(/\/$/, '');
}

function serviceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in env');
  return key;
}

async function request(pathname, { method = 'GET', query = '', body, prefer } = {}) {
  const url = `${baseUrl()}/rest/v1/${pathname}${query ? `?${query}` : ''}`;
  const headers = {
    apikey: serviceRoleKey(),
    Authorization: `Bearer ${serviceRoleKey()}`,
    Accept: 'application/json',
    'Accept-Profile': 'master',
    'Content-Profile': 'master',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.stringify(JSON.parse(text));
    } catch {
      // keep raw text
    }
    throw new Error(`${method} ${pathname} failed (${res.status}): ${detail}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  loadLocalEnv();

  const catalogPath = path.resolve(backendRoot, 'data/ability/skill_structured_catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error(
      `Catalog not found: ${catalogPath}. Run build-skill-structured-catalog.mjs first.`,
    );
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  if (entries.length === 0) throw new Error('No entries in catalog');

  const rows = await request('m_skill', { query: 'select=skill_id,skill_desc&limit=1000' });
  const byDesc = new Map(rows.map((r) => [r.skill_desc, r]));

  const updates = [];
  const effectRows = [];
  const missing = [];

  for (const e of entries) {
    const db = byDesc.get(e.skillDesc);
    if (!db) {
      missing.push(e.skillDesc);
      continue;
    }

    const s = e.structured;
    updates.push({
      skill_id: db.skill_id,
      skill_type: s.skillType,
      target_rule: s.targetRule,
      effect_summary_type: s.effectSummaryType,
      proc_chance: s.procChance,
      duration_turns: s.durationTurns,
      trigger_timing: s.triggerTiming,
      script_hook: s.scriptHook,
      parse_status: s.parseStatus,
      params_json: s.params ?? {},
    });

    for (const fx of s.effects ?? []) {
      effectRows.push({
        skill_id: db.skill_id,
        effect_order: fx.order,
        effect_type: fx.effectType,
        target_rule: fx.targetRule,
        trigger_timing: fx.triggerTiming,
        proc_chance: fx.procChance,
        duration_turns: fx.durationTurns,
        radius: fx.radius,
        value_num: fx.valueNum,
        value_text: fx.valueText,
        params_json: fx.params ?? {},
        is_active: true,
      });
    }
  }

  console.log(`[info] catalog entries=${entries.length}`);
  console.log(`[info] mapped skills=${updates.length}, missing=${missing.length}`);
  console.log(`[info] effect rows=${effectRows.length}`);

  if (missing.length > 0) {
    console.log('[warn] Missing descriptions in DB:');
    for (const m of missing) console.log(`  - ${m}`);
  }

  if (!shouldApply) {
    console.log('[dry-run] No database changes applied. Use --apply to execute.');
    return;
  }

  for (const u of updates) {
    await request('m_skill', {
      method: 'PATCH',
      query: `skill_id=eq.${u.skill_id}`,
      body: {
        skill_type: u.skill_type,
        target_rule: u.target_rule,
        effect_summary_type: u.effect_summary_type,
        proc_chance: u.proc_chance,
        duration_turns: u.duration_turns,
        trigger_timing: u.trigger_timing,
        script_hook: u.script_hook,
        parse_status: u.parse_status,
        params_json: u.params_json,
      },
      prefer: 'return=minimal',
    });
  }

  const skillIds = updates.map((u) => u.skill_id);
  for (const ids of chunk(skillIds, 25)) {
    const inList = ids.join(',');
    await request('m_skill_effect', {
      method: 'DELETE',
      query: `skill_id=in.(${inList})`,
      prefer: 'return=minimal',
    });
  }

  for (const rowsChunk of chunk(effectRows, 200)) {
    await request('m_skill_effect', {
      method: 'POST',
      body: rowsChunk,
      prefer: 'return=minimal',
    });
  }

  console.log('[ok] Structured skill data applied to master.m_skill and master.m_skill_effect');
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
