#!/usr/bin/env bun
/**
 * announcements を seed する（ローカル/リモート共通）
 * Usage: bun run scripts/seed-announcements.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

type AnnouncementSeed = {
  announcement_id: string;
  title: string;
  contents: string;
  is_active?: boolean;
  published_at?: string | Date;
  unpublished_at?: string | Date | null;
};

const ANNOUNCEMENTS: AnnouncementSeed[] = [
  {
    announcement_id: 'test-announcement-20260531',
    title: 'テストのお知らせ',
    contents: 'これは表示確認用のテストお知らせです。',
    is_active: true,
    published_at: new Date(),
    unpublished_at: null,
  },
];

const shouldApply = process.argv.includes('--apply');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

function loadEnvFile(filePath: string) {
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

function loadLocalEnv() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  loadEnvFile(path.resolve(backendRoot, '.env.local'));
}

function toIsoString(value: string | Date | undefined, fallback: string) {
  if (!value) return fallback;
  return value instanceof Date ? value.toISOString() : value;
}

function validateSeed(row: AnnouncementSeed) {
  if (!row.announcement_id?.trim()) throw new Error('announcement_id is required.');
  if (!row.title?.trim()) throw new Error(`title is required for ${row.announcement_id}.`);
  if (!row.contents?.trim()) throw new Error(`contents is required for ${row.announcement_id}.`);
  if (row.title.length > 120) throw new Error(`title is too long for ${row.announcement_id}.`);
  if (row.contents.length > 4000) {
    throw new Error(`contents is too long for ${row.announcement_id}.`);
  }
  if (row.published_at && row.unpublished_at) {
    const publishedAt = new Date(row.published_at);
    const unpublishedAt = new Date(row.unpublished_at);
    if (Number.isNaN(publishedAt.getTime()) || Number.isNaN(unpublishedAt.getTime())) {
      throw new Error(`Invalid published/unpublished datetime for ${row.announcement_id}.`);
    }
    if (unpublishedAt <= publishedAt) {
      throw new Error(`unpublished_at must be after published_at for ${row.announcement_id}.`);
    }
  }
}

async function main() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (ANNOUNCEMENTS.length === 0) throw new Error('No announcements configured.');

  for (const row of ANNOUNCEMENTS) validateSeed(row);

  const nowIso = new Date().toISOString();
  const payload = ANNOUNCEMENTS.map((row) => ({
    announcement_id: row.announcement_id,
    title: row.title,
    contents: row.contents,
    is_active: row.is_active ?? true,
    published_at: toIsoString(row.published_at, nowIso),
    unpublished_at: row.unpublished_at ? toIsoString(row.unpublished_at, nowIso) : null,
    updated_at: nowIso,
  }));

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const ids = payload.map((row) => row.announcement_id);
  const { data: before, error: beforeError } = await supabase
    .from('announcements')
    .select('announcement_id,title,is_active,published_at,unpublished_at,updated_at')
    .in('announcement_id', ids);
  if (beforeError) throw beforeError;

  console.log('[before]', before ?? []);
  console.log(
    `[seed] ${payload.length} announcements: ${payload.map((row) => row.announcement_id).join(', ')}`,
  );

  if (!shouldApply) {
    console.log('[dry-run] Re-run with --apply to upsert announcements');
    return;
  }

  const { error: upsertError } = await supabase
    .from('announcements')
    .upsert(payload, { onConflict: 'announcement_id' });
  if (upsertError) throw upsertError;

  const { data: after, error: afterError } = await supabase
    .from('announcements')
    .select('announcement_id,title,is_active,published_at,unpublished_at,updated_at')
    .in('announcement_id', ids);
  if (afterError) throw afterError;

  console.log('[ok] upserted announcements');
  console.log('[after]', after ?? []);
}

main().catch((error) => {
  console.error('[error]', error);
  process.exitCode = 1;
});
