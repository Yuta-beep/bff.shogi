#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const imageSource = getArgValue('--source', 'supabase');
const imageBucket = getArgValue('--bucket', 'piece-images');
const imagePrefix = getArgValue('--prefix', 'pieces').replace(/^\/+|\/+$/g, '');
const resetVersion = args.has('--reset-version');

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

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

function getApiBase() {
  const base = mustEnv('SUPABASE_URL').replace(/\/$/, '');
  return `${base}/rest/v1`;
}

function getServiceRoleKey() {
  return mustEnv('SUPABASE_SERVICE_ROLE_KEY');
}

async function request(pathname, { method = 'GET', query = '', body, prefer } = {}) {
  const url = `${getApiBase()}/${pathname}${query ? `?${query}` : ''}`;
  const key = getServiceRoleKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
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
      // keep raw
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

function getShogiRoot() {
  const candidates = [
    path.resolve(backendRoot, '../../SHOGI_GAME'),
    path.resolve(backendRoot, '../../../SHOGI_GAME'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const FILENAME_OVERRIDES = {
  歩: '歩兵.png',
  香: '香車.png',
  桂: '桂馬.png',
  銀: '銀将.png',
  金: '金将.png',
  玉: '王将.png',
  王: '王将.png',
  角: '角行.png',
  飛: '飛車.png',
};

function resolveImageFileName(kanji, shogiRoot) {
  const candidates = [];

  if (FILENAME_OVERRIDES[kanji]) {
    candidates.push(FILENAME_OVERRIDES[kanji]);
  }
  candidates.push(`${kanji}.png`);

  if (!shogiRoot) {
    return candidates[0];
  }

  for (const candidate of candidates) {
    const full = path.resolve(shogiRoot, candidate);
    if (fs.existsSync(full)) {
      return candidate;
    }
  }

  return candidates[0];
}

function toImageKey(fileName) {
  return imagePrefix ? `${imagePrefix}/${fileName}` : fileName;
}

async function loadPieces() {
  return request('m_piece', {
    method: 'GET',
    query:
      'select=piece_id,kanji,image_source,image_bucket,image_key,image_version&order=piece_id.asc',
  });
}

async function updatePiece(pieceId, payload) {
  await request('m_piece', {
    method: 'PATCH',
    query: `piece_id=eq.${pieceId}`,
    body: payload,
    prefer: 'return=minimal',
  });
}

async function main() {
  loadLocalEnv();

  const shogiRoot = getShogiRoot();
  if (!shogiRoot) {
    console.warn('[warn] SHOGI_GAME directory was not found. File existence checks are skipped.');
  }

  const pieces = await loadPieces();
  if (!Array.isArray(pieces) || pieces.length === 0) {
    console.log('[info] No pieces found in master.m_piece.');
    return;
  }

  const planned = pieces.map((piece) => {
    const fileName = resolveImageFileName(piece.kanji, shogiRoot);
    const imageKey = toImageKey(fileName);

    return {
      pieceId: piece.piece_id,
      kanji: piece.kanji,
      before: {
        image_source: piece.image_source,
        image_bucket: piece.image_bucket,
        image_key: piece.image_key,
        image_version: piece.image_version,
      },
      after: {
        image_source: imageSource,
        image_bucket: imageBucket,
        image_key: imageKey,
        image_version: resetVersion ? 1 : piece.image_version,
      },
      fileName,
    };
  });

  const changed = planned.filter(
    (item) =>
      item.before.image_source !== item.after.image_source ||
      item.before.image_bucket !== item.after.image_bucket ||
      item.before.image_key !== item.after.image_key ||
      item.before.image_version !== item.after.image_version,
  );

  console.log(`[info] Total pieces: ${planned.length}`);
  console.log(`[info] Changed rows: ${changed.length}`);
  console.log(
    `[info] image_source=${imageSource} image_bucket=${imageBucket} image_prefix=${imagePrefix || '(none)'}`,
  );

  const preview = changed.slice(0, 20).map((item) => ({
    piece_id: item.pieceId,
    kanji: item.kanji,
    image_key: item.after.image_key,
    image_version: item.after.image_version,
  }));

  if (preview.length > 0) {
    console.log('[preview] first rows to update:');
    console.table(preview);
  }

  if (!shouldApply) {
    console.log('[dry-run] No updates applied. Re-run with --apply to persist.');
    return;
  }

  let applied = 0;
  for (const item of changed) {
    await updatePiece(item.pieceId, item.after);
    applied += 1;
  }

  console.log(`[ok] Updated ${applied} piece image rows.`);
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exitCode = 1;
});
