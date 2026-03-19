#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const argList = process.argv.slice(2);
const args = new Set(argList);
const shouldApply = args.has('--apply');
const updateDb = args.has('--update-db');

function getArgValue(name, fallback) {
  const hit = argList.find((arg) => arg.startsWith(`${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split('=');
  return value || fallback;
}

const bucket = getArgValue('--bucket', 'gacha-images');
const prefix = getArgValue('--prefix', 'assets/gacha').replace(/^\/+|\/+$/g, '');
const fileSizeLimit = getArgValue('--file-size-limit', '20MB');

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

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  loadEnvFile(path.resolve(backendRoot, '.env.local'));
}

function buildSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) in env');
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in env');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function findGachaAssetRoot() {
  const candidates = [
    path.resolve(backendRoot, 'assets/gacha'),
    path.resolve(backendRoot, '../frontend/assets/gacha'),
    path.resolve(backendRoot, '../assets/gacha'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'gacha image directory not found. expected one of: backend/assets/gacha or frontend/assets/gacha',
  );
}

function toStoragePath(fileName) {
  return prefix ? `${prefix}/${fileName}` : fileName;
}

const GACHA_IMAGE_PLAN = [
  { gachaCode: 'hihen', fileName: 'hihen.png' },
  { gachaCode: 'ukanmuri', fileName: 'ukanmuri.png' },
  { gachaCode: 'shinnyo', fileName: 'shinnyo.png' },
  { gachaCode: 'kanken1', fileName: 'kanken1.png' },
];

async function ensureBucketExists(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);

  const found = buckets?.find((b) => b.name === bucket);
  if (found) {
    if (!shouldApply) return;

    const currentLimit = found.file_size_limit ?? null;
    const normalized = String(fileSizeLimit).trim();
    const expectedBytes = normalized.toUpperCase().endsWith('MB')
      ? Number.parseInt(normalized, 10) * 1_000_000
      : Number.parseInt(normalized, 10);

    if (
      (found.public ?? false) !== true ||
      (Number.isFinite(expectedBytes) && currentLimit !== expectedBytes)
    ) {
      const { error: updateError } = await supabase.storage.updateBucket(bucket, {
        public: true,
        fileSizeLimit: normalized,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
      if (updateError) throw new Error(`updateBucket failed: ${updateError.message}`);
      console.log(`[ok] Updated bucket "${bucket}" (public=true, file size limit=${normalized})`);
    }
    return;
  }

  if (!shouldApply) {
    console.log(`[dry-run] Bucket "${bucket}" does not exist (would create with --apply).`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: fileSizeLimit,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (createError) throw new Error(`createBucket failed: ${createError.message}`);

  console.log(`[ok] Created bucket: ${bucket}`);
}

async function uploadImage(supabase, storagePath, fullPath) {
  const binary = fs.readFileSync(fullPath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, binary, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: '31536000',
  });
  if (error) throw new Error(`upload ${storagePath} failed: ${error.message}`);
}

async function updateGachaImageRef(supabase, gachaCode, storagePath) {
  const { error } = await supabase
    .schema('master')
    .from('m_gacha')
    .update({
      image_source: 'supabase',
      image_bucket: bucket,
      image_key: storagePath,
      image_version: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('gacha_code', gachaCode);

  if (error) throw new Error(`update m_gacha(gacha_code=${gachaCode}) failed: ${error.message}`);
}

async function main() {
  loadLocalEnv();
  const supabase = buildSupabaseAdmin();
  const assetRoot = findGachaAssetRoot();
  await ensureBucketExists(supabase);

  const plan = GACHA_IMAGE_PLAN.map((item) => {
    const fullPath = path.resolve(assetRoot, item.fileName);
    return {
      ...item,
      fullPath,
      exists: fs.existsSync(fullPath),
      storagePath: toStoragePath(item.fileName),
    };
  });

  const missing = plan.filter((item) => !item.exists);
  if (missing.length > 0) {
    console.log('[error] Missing local files:');
    for (const item of missing) console.log(`- ${item.fullPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[info] asset_root=${assetRoot}`);
  console.log(`[info] bucket=${bucket}, prefix=${prefix || '(none)'}`);
  console.table(
    plan.map((item) => ({
      gacha_code: item.gachaCode,
      file: item.fileName,
      storage_key: item.storagePath,
    })),
  );

  if (!shouldApply) {
    console.log('[dry-run] No uploads applied. Re-run with --apply to persist.');
    return;
  }

  for (const item of plan) {
    await uploadImage(supabase, item.storagePath, item.fullPath);
    console.log(`[ok] uploaded ${item.storagePath}`);

    if (updateDb) {
      await updateGachaImageRef(supabase, item.gachaCode, item.storagePath);
      console.log(`[ok] updated master.m_gacha for ${item.gachaCode}`);
    }
  }

  console.log('[ok] Completed gacha image upload flow.');
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exitCode = 1;
});
