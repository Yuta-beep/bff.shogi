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

function toLegacyTriggerType(triggerType) {
  switch (triggerType) {
    case 'after_move':
      return 'after_move';
    default:
      return null;
  }
}

function fallbackSummaryType(definition) {
  if (definition.classification?.implementationKind === 'script_hook') return 'scripted';
  if (definition.classification?.implementationKind === 'composite') return 'composite';
  return definition.effects?.[0]?.type ?? 'scripted';
}

async function main() {
  loadLocalEnv();

  const catalogPath = path.resolve(backendRoot, 'data/ability/skill_definition_v2_catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Skill definition catalog not found: ${catalogPath}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const definitions = Array.isArray(catalog.definitions) ? catalog.definitions : [];
  if (definitions.length === 0) throw new Error('No definitions in catalog file');

  const rows = await request('m_skill', { query: 'select=skill_id,skill_desc&limit=1000' });
  const byDesc = new Map(rows.map((r) => [r.skill_desc, r]));

  const updates = [];
  const conditions = [];
  const effects = [];
  const missing = [];

  for (const definition of definitions) {
    const skillText = definition?.source?.skillText;
    const db = byDesc.get(skillText);
    if (!db) {
      missing.push(skillText);
      continue;
    }

    updates.push({
      skill_id: db.skill_id,
      implementation_kind: definition.classification?.implementationKind ?? null,
      trigger_group: definition.trigger?.group ?? null,
      trigger_type: definition.trigger?.type ?? null,
      source_kind: definition.source?.sourceKind ?? 'manual',
      source_file: definition.source?.sourceFile ?? null,
      source_function: definition.source?.sourceFunction ?? null,
      tags_json: definition.classification?.tags ?? [],
      script_hook: definition.scriptHook ?? null,
      effect_summary_type: fallbackSummaryType(definition),
      trigger_timing: toLegacyTriggerType(definition.trigger?.type ?? null),
    });

    for (const condition of definition.conditions ?? []) {
      conditions.push({
        skill_id: db.skill_id,
        condition_order: condition.order,
        condition_group: condition.group,
        condition_type: condition.type,
        params_json: condition.params ?? {},
        is_active: true,
      });
    }

    for (const effect of definition.effects ?? []) {
      effects.push({
        skill_id: db.skill_id,
        effect_order: effect.order,
        effect_group: effect.group,
        effect_type: effect.type,
        target_group: effect.target?.group ?? null,
        target_selector: effect.target?.selector ?? null,
        target_rule: 'unspecified',
        trigger_timing: toLegacyTriggerType(definition.trigger?.type ?? null),
        params_json: effect.params ?? {},
        is_active: true,
      });
    }
  }

  console.log(`[info] catalog definitions=${definitions.length}`);
  console.log(`[info] mapped skills=${updates.length}, missing=${missing.length}`);
  console.log(`[info] condition rows=${conditions.length}`);
  console.log(`[info] effect rows=${effects.length}`);

  if (missing.length > 0) {
    console.log('[warn] Missing descriptions in DB:');
    for (const item of missing) console.log(`  - ${item}`);
  }

  if (!shouldApply) {
    console.log('[dry-run] No database changes applied. Use --apply to execute.');
    return;
  }

  for (const update of updates) {
    await request('m_skill', {
      method: 'PATCH',
      query: `skill_id=eq.${update.skill_id}`,
      body: {
        implementation_kind: update.implementation_kind,
        trigger_group: update.trigger_group,
        trigger_type: update.trigger_type,
        source_kind: update.source_kind,
        source_file: update.source_file,
        source_function: update.source_function,
        tags_json: update.tags_json,
        script_hook: update.script_hook,
        effect_summary_type: update.effect_summary_type,
        trigger_timing: update.trigger_timing,
      },
      prefer: 'return=minimal',
    });
  }

  const skillIds = updates.map((update) => update.skill_id);
  for (const ids of chunk(skillIds, 25)) {
    const inList = ids.join(',');
    await request('m_skill_condition', {
      method: 'DELETE',
      query: `skill_id=in.(${inList})`,
      prefer: 'return=minimal',
    });
    await request('m_skill_effect', {
      method: 'DELETE',
      query: `skill_id=in.(${inList})`,
      prefer: 'return=minimal',
    });
  }

  for (const rowsChunk of chunk(conditions, 200)) {
    if (rowsChunk.length === 0) continue;
    await request('m_skill_condition', {
      method: 'POST',
      body: rowsChunk,
      prefer: 'return=minimal',
    });
  }

  for (const rowsChunk of chunk(effects, 200)) {
    if (rowsChunk.length === 0) continue;
    await request('m_skill_effect', {
      method: 'POST',
      body: rowsChunk,
      prefer: 'return=minimal',
    });
  }

  console.log(
    '[ok] Sample skill v2 definitions applied to master.m_skill / m_skill_condition / m_skill_effect',
  );
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
