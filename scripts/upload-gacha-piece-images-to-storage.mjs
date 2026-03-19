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
const prefix = getArgValue('--prefix', 'pieces').replace(/^\/+|\/+$/g, '');

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

function findPieceAssetRoot() {
  const candidates = [
    path.resolve(backendRoot, 'assets/gacha/pieces'),
    path.resolve(backendRoot, '../frontend/assets/gacha/pieces'),
    path.resolve(backendRoot, '../assets/gacha/pieces'),
    path.resolve(backendRoot, '../../SHOGI_GAME'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'gacha piece image directory not found. expected frontend/assets/gacha/pieces or SHOGI_GAME',
  );
}

function listPngFiles(root) {
  const all = fs.readdirSync(root, { withFileTypes: true });
  return all
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
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
    console.log(`[dry-run] Bucket "${bucket}" does not exist (would create with --apply).`);
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

async function loadPieceRowsByKanji(supabase, kanjis) {
  const { data, error } = await supabase
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name,image_source,image_bucket,image_key,image_version')
    .in('kanji', kanjis);
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

async function main() {
  loadLocalEnv();
  const supabase = buildSupabaseAdmin();
  await ensureBucketExists(supabase);

  const assetRoot = findPieceAssetRoot();
  const pngNames = listPngFiles(assetRoot);
  if (pngNames.length === 0) {
    console.log('[info] No png files found.');
    return;
  }

  const records = pngNames
    .map((fileName) => {
      const kanji = path.basename(fileName, '.png');
      return { fileName, kanji };
    })
    .filter((r) => r.kanji.length > 0);

  const kanjis = [...new Set(records.map((r) => r.kanji))];
  const pieceRows = await loadPieceRowsByKanji(supabase, kanjis);
  const pieceByKanji = new Map(pieceRows.map((row) => [row.kanji, row]));

  const plan = records.map((r) => {
    const piece = pieceByKanji.get(r.kanji);
    const storagePath = piece ? `${prefix}/piece-${piece.piece_id}.png` : null;
    return {
      kanji: r.kanji,
      fileName: r.fileName,
      fullPath: path.resolve(assetRoot, r.fileName),
      pieceId: piece?.piece_id ?? null,
      storagePath,
      hasPiece: Boolean(piece),
    };
  });

  const missingPieces = plan.filter((p) => !p.hasPiece);
  if (missingPieces.length > 0) {
    console.log('[warn] m_pieceに未登録のためスキップされる画像:');
    console.table(missingPieces.map((x) => ({ kanji: x.kanji, file: x.fileName })));
  }

  const targets = plan.filter((p) => p.hasPiece && p.storagePath);

  console.log(`[info] asset_root=${assetRoot}`);
  console.log(`[info] targets=${targets.length}, skipped=${missingPieces.length}`);
  console.table(
    targets.map((t) => ({
      kanji: t.kanji,
      piece_id: t.pieceId,
      file: t.fileName,
      storage_key: t.storagePath,
    })),
  );

  if (!shouldApply) {
    console.log('[dry-run] No uploads applied. Re-run with --apply to persist.');
    return;
  }

  for (const target of targets) {
    await uploadImage(supabase, target.storagePath, target.fullPath);
    console.log(`[ok] uploaded ${target.storagePath}`);

    if (updateDb && target.pieceId != null) {
      await updatePieceAssetRef(supabase, target.pieceId, target.storagePath);
      console.log(`[ok] updated m_piece piece_id=${target.pieceId}`);
    }
  }

  console.log('[ok] Completed gacha piece image upload flow.');
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exitCode = 1;
});
