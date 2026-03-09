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

function getArgValue(name, fallback) {
  const hit = argList.find((arg) => arg.startsWith(`${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split('=');
  return value || fallback;
}

const bucket = getArgValue('--bucket', 'piece-images');
const prefix = getArgValue('--prefix', 'pieces').replace(/^\/+|\/+$/g, '');
const updateDb = args.has('--update-db');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(path.resolve(backendRoot, '.env'));
  loadEnvFile(path.resolve(backendRoot, '.env.local'));
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

function buildSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) in env');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in env');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getShogiRoot() {
  const candidates = [
    path.resolve(backendRoot, '../../SHOGI_GAME'),
    path.resolve(backendRoot, '../../../SHOGI_GAME'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('SHOGI_GAME directory not found from backend/scripts');
}

const FILENAME_OVERRIDES = {
  '歩': '歩兵.png',
  '香': '香車.png',
  '桂': '桂馬.png',
  '銀': '銀将.png',
  '金': '金将.png',
  '玉': '王将.png',
  '王': '王将.png',
  '角': '角行.png',
  '飛': '飛車.png',
};

function resolveFileCandidates(pieceKanji, pieceName, dbImageKey) {
  const candidates = [];

  if (dbImageKey) {
    const fromKey = path.basename(dbImageKey);
    if (fromKey) candidates.push(fromKey);
  }

  if (FILENAME_OVERRIDES[pieceKanji]) {
    candidates.push(FILENAME_OVERRIDES[pieceKanji]);
  }

  if (pieceName && pieceName.trim()) {
    candidates.push(`${pieceName.trim()}.png`);
  }

  candidates.push(`${pieceKanji}.png`);
  return [...new Set(candidates)];
}

function findExistingFile(root, fileCandidates) {
  for (const fileName of fileCandidates) {
    const fullPath = path.resolve(root, fileName);
    if (fs.existsSync(fullPath)) {
      return { fileName, fullPath };
    }
  }
  return null;
}

function buildStoragePath(fileName, existingImageKey, pieceId) {
  const rawPath = existingImageKey && existingImageKey.trim()
    ? existingImageKey.trim().replace(/^\/+/, '')
    : (prefix ? `${prefix}/${fileName}` : fileName);

  if (isSafeStorageKey(rawPath)) {
    return rawPath;
  }

  return buildFallbackStoragePath(fileName, pieceId);
}

function isSafeStorageKey(storagePath) {
  return /^[A-Za-z0-9/_\-.]+$/.test(storagePath);
}

function buildFallbackStoragePath(fileName, pieceId) {
  const ext = path.extname(fileName).toLowerCase();
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '.png';
  return prefix ? `${prefix}/piece-${pieceId}${safeExt}` : `piece-${pieceId}${safeExt}`;
}

async function ensureBucketExists(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);

  const found = buckets?.some((b) => b.name === bucket);
  if (found) return;

  if (!shouldApply) {
    console.log(`[dry-run] Bucket \"${bucket}\" does not exist (would create on --apply).`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (createError) throw new Error(`createBucket failed: ${createError.message}`);

  console.log(`[ok] Created bucket: ${bucket}`);
}

async function loadPieces(supabase) {
  const { data, error } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name,image_source,image_bucket,image_key,image_version')
    .order('piece_id', { ascending: true });

  if (error) throw new Error(`load m_piece failed: ${error.message}`);
  return data ?? [];
}

async function updatePieceAssetRef(supabase, pieceId, storagePath) {
  const { error } = await supabase
    .schema('master')
    .from('m_piece')
    .update({
      image_source: 'supabase',
      image_bucket: bucket,
      image_key: storagePath,
    })
    .eq('piece_id', pieceId);

  if (error) throw new Error(`update m_piece(piece_id=${pieceId}) failed: ${error.message}`);
}

async function uploadImage(supabase, storagePath, fullPath) {
  const binary = fs.readFileSync(fullPath);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, binary, {
      upsert: true,
      contentType: 'image/png',
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`upload ${storagePath} failed: ${error.message}`);
  }
}

async function main() {
  loadLocalEnv();

  const shogiRoot = getShogiRoot();
  const supabase = buildSupabaseAdmin();

  await ensureBucketExists(supabase);

  const pieces = await loadPieces(supabase);
  if (pieces.length === 0) {
    console.log('[info] No piece rows found in master.m_piece.');
    return;
  }

  const plan = [];
  const missing = [];

  for (const piece of pieces) {
    const candidates = resolveFileCandidates(piece.kanji, piece.name, piece.image_key);
    const found = findExistingFile(shogiRoot, candidates);

    if (!found) {
      missing.push({ piece_id: piece.piece_id, kanji: piece.kanji, tried: candidates.join(', ') });
      continue;
    }

    const storagePath = buildStoragePath(found.fileName, piece.image_key, piece.piece_id);
    const nextBucket = piece.image_bucket || bucket;

    plan.push({
      pieceId: piece.piece_id,
      kanji: piece.kanji,
      fileName: found.fileName,
      fullPath: found.fullPath,
      storagePath,
      nextBucket,
      needsDbUpdate: updateDb && (piece.image_source !== 'supabase' || piece.image_bucket !== bucket || piece.image_key !== storagePath),
    });
  }

  console.log(`[info] Total pieces: ${pieces.length}`);
  console.log(`[info] Upload candidates: ${plan.length}`);
  console.log(`[info] Missing local files: ${missing.length}`);

  if (missing.length > 0) {
    console.log('[warn] Missing files (first 20):');
    console.table(missing.slice(0, 20));
  }

  console.log('[preview] First upload rows:');
  console.table(
    plan.slice(0, 20).map((row) => ({
      piece_id: row.pieceId,
      kanji: row.kanji,
      src_file: row.fileName,
      bucket: bucket,
      storage_path: row.storagePath,
      db_update: row.needsDbUpdate,
    }))
  );

  if (!shouldApply) {
    console.log('[dry-run] No upload executed. Re-run with --apply to upload files.');
    if (updateDb) {
      console.log('[dry-run] --update-db is set, DB updates will also run on --apply.');
    }
    return;
  }

  let uploaded = 0;
  let dbUpdated = 0;

  for (const row of plan) {
    await uploadImage(supabase, row.storagePath, row.fullPath);
    uploaded += 1;

    if (row.needsDbUpdate) {
      await updatePieceAssetRef(supabase, row.pieceId, row.storagePath);
      dbUpdated += 1;
    }
  }

  console.log(`[ok] Uploaded images: ${uploaded}`);
  if (updateDb) {
    console.log(`[ok] Updated DB rows: ${dbUpdated}`);
  }
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exitCode = 1;
});
