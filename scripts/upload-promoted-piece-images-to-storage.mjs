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

const bucket = getArgValue('--bucket', 'piece-images');
const prefix = getArgValue('--prefix', 'pieces/promoted').replace(/^\/+|\/+$/g, '');
const imageDir = getArgValue('--dir', path.resolve(backendRoot, '成り駒'));

const PROMOTED_PIECE_FILE_MAP = [
  { pieceCode: 'piece_shogi_to', fileName: 'と.png' },
  { pieceCode: 'piece_shogi_ny', fileName: '成香.png' },
  { pieceCode: 'piece_shogi_nk', fileName: '成桂.png' },
  { pieceCode: 'piece_shogi_ng', fileName: '成銀.png' },
  { pieceCode: 'piece_shogi_um', fileName: '龍馬.png' },
  { pieceCode: 'piece_shogi_ry', fileName: '竜王.png' },
];

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

async function ensureBucketExists(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);

  const found = buckets?.find((b) => b.name === bucket);
  if (found) {
    if (!shouldApply) return;
    if (found.public) return;
    const { error: updateError } = await supabase.storage.updateBucket(bucket, {
      public: true,
      fileSizeLimit: '10MB',
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (updateError) throw new Error(`updateBucket failed: ${updateError.message}`);
    console.log(`[ok] Updated bucket "${bucket}" to public=true`);
    return;
  }

  if (!shouldApply) {
    console.log(`[dry-run] Bucket "${bucket}" does not exist (would create on --apply).`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (createError) throw new Error(`createBucket failed: ${createError.message}`);

  console.log(`[ok] Created bucket: ${bucket}`);
}

async function loadPromotedPieceRows(supabase, pieceCodes) {
  const { data, error } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,piece_code,kanji,image_source,image_bucket,image_key')
    .in('piece_code', pieceCodes);
  if (error) throw new Error(`load m_piece failed: ${error.message}`);
  return data ?? [];
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

async function updatePieceAssetRef(supabase, pieceId, storagePath) {
  const { error } = await supabase
    .schema('master')
    .from('m_piece')
    .update({
      image_source: 'supabase',
      image_bucket: bucket,
      image_key: storagePath,
      image_version: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('piece_id', pieceId);
  if (error) throw new Error(`update m_piece(piece_id=${pieceId}) failed: ${error.message}`);
}

function buildStoragePath(pieceId) {
  return `${prefix}/piece-${pieceId}.png`;
}

async function main() {
  loadLocalEnv();
  const supabase = buildSupabaseAdmin();
  await ensureBucketExists(supabase);

  if (!fs.existsSync(imageDir) || !fs.statSync(imageDir).isDirectory()) {
    throw new Error(`Image directory not found: ${imageDir}`);
  }

  const pieceCodes = PROMOTED_PIECE_FILE_MAP.map((row) => row.pieceCode);
  const rows = await loadPromotedPieceRows(supabase, pieceCodes);
  const rowByCode = new Map(rows.map((row) => [row.piece_code, row]));

  const missingPieceCodes = pieceCodes.filter((code) => !rowByCode.has(code));
  if (missingPieceCodes.length > 0) {
    throw new Error(`Missing promoted piece rows in m_piece: ${missingPieceCodes.join(', ')}`);
  }

  const plan = PROMOTED_PIECE_FILE_MAP.map((item) => {
    const row = rowByCode.get(item.pieceCode);
    const fullPath = path.resolve(imageDir, item.fileName);
    const fileExists = fs.existsSync(fullPath);
    const pieceId = row?.piece_id ?? null;
    const storagePath = pieceId ? buildStoragePath(pieceId) : null;
    return {
      pieceCode: item.pieceCode,
      kanji: row?.kanji ?? null,
      pieceId,
      fileName: item.fileName,
      fullPath,
      fileExists,
      storagePath,
      currentKey: row?.image_key ?? null,
    };
  });

  const missingFiles = plan.filter((item) => !item.fileExists);
  if (missingFiles.length > 0) {
    throw new Error(
      `Missing local promoted piece images: ${missingFiles.map((item) => item.fileName).join(', ')}`,
    );
  }

  console.log(`[info] image_dir=${imageDir}`);
  console.log(`[info] bucket=${bucket}`);
  console.log(`[info] prefix=${prefix}`);
  console.table(
    plan.map((item) => ({
      piece_code: item.pieceCode,
      piece_id: item.pieceId,
      kanji: item.kanji,
      file: item.fileName,
      storage_key: item.storagePath,
      current_key: item.currentKey,
    })),
  );

  if (!shouldApply) {
    console.log('[dry-run] No uploads applied. Re-run with --apply to persist.');
    return;
  }

  for (const item of plan) {
    if (!item.storagePath) continue;
    await uploadImage(supabase, item.storagePath, item.fullPath);
    console.log(`[ok] uploaded ${item.storagePath}`);

    if (updateDb && item.pieceId != null) {
      await updatePieceAssetRef(supabase, item.pieceId, item.storagePath);
      console.log(`[ok] updated m_piece piece_id=${item.pieceId}`);
    }
  }

  console.log('[ok] Completed promoted piece image upload.');
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exitCode = 1;
});
