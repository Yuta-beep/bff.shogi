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

function getStageHtmlPath() {
  const candidates = [
    path.resolve(backendRoot, '../../SHOGI_GAME/stage_shogi.html'),
    path.resolve(backendRoot, '../../../SHOGI_GAME/stage_shogi.html'),
    path.resolve(backendRoot, '../../SHOGI_GAME/stage_shogi_css.html'),
    path.resolve(backendRoot, '../../../SHOGI_GAME/stage_shogi_css.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('stage_shogi.html not found');
}

function extractArrayLiteral(htmlText, constName) {
  const marker = `const ${constName} = [`;
  const start = htmlText.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${constName}`);

  const arrayStart = htmlText.indexOf('[', start);
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = arrayStart; i < htmlText.length; i += 1) {
    const ch = htmlText[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate;

    if (inSingle || inDouble || inTemplate) continue;

    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return htmlText.slice(arrayStart, i + 1);
      }
    }
  }

  throw new Error(`Could not parse array literal for ${constName}`);
}

function parseStagesFromHtml(htmlPath) {
  const htmlText = fs.readFileSync(htmlPath, 'utf8');
  const arrayLiteral = extractArrayLiteral(htmlText, 'STAGES');
  const parsed = Function(`"use strict"; return (${arrayLiteral});`)();
  if (!Array.isArray(parsed)) throw new Error('STAGES is not an array');
  return parsed;
}

function isBoardPieceToken(token) {
  return typeof token === 'string' && token.length >= 2 && (token.startsWith('C') || token.startsWith('P'));
}

function parseToken(token) {
  const side = token[0] === 'C' ? 'enemy' : 'player';
  const kanji = token.slice(1).trim();
  return { side, kanji };
}

function normalizeKanjiForPieceLookup(kanji) {
  const alias = {
    王: '玉',
    赤鬼: '鬼',
    青鬼: '鬼',
    黒鬼: '鬼',
  };
  return alias[kanji] ?? kanji;
}

function inferBoss(stageNo, kanji, row, col) {
  if (kanji === '王' && row <= 1 && col >= 3 && col <= 5) return true;
  if (stageNo >= 30 && ['K', '巨', '朧', '死', '魂'].includes(kanji)) return true;
  return false;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in env`);
  return v;
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

function buildStageRows(stages) {
  return stages.map((s, idx) => {
    const stageNo = Number.isFinite(Number(s.stage)) ? Number(s.stage) : idx + 1;
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Stage ${stageNo}`;
    return {
      stage_no: stageNo,
      stage_name: name,
      unlock_stage_no: stageNo > 1 ? stageNo - 1 : null,
      difficulty: Math.ceil(stageNo / 5),
      stage_category: stageNo <= 3 ? 'tutorial' : 'normal',
      clear_condition_type: 'defeat_boss',
      clear_condition_params: {},
      recommended_power: stageNo * 100,
      stamina_cost: Math.min(30, Math.max(0, Math.ceil(stageNo / 2))),
      is_active: true,
      published_at: null,
      unpublished_at: null,
    };
  });
}

function buildStageDetailRows(stages, stageIdByNo, pieceIdByKanji) {
  const stagePieceRows = [];
  const placementRows = [];
  const missingKanji = new Map();

  for (let i = 0; i < stages.length; i += 1) {
    const stageObj = stages[i];
    const stageNo = Number.isFinite(Number(stageObj.stage)) ? Number(stageObj.stage) : i + 1;
    const stageId = stageIdByNo.get(stageNo);
    if (!stageId) continue;

    const board = Array.isArray(stageObj.board) ? stageObj.board : [];
    const enemyCountByKanji = new Map();
    const enemyBossByKanji = new Map();

    for (let row = 0; row < board.length; row += 1) {
      const cols = Array.isArray(board[row]) ? board[row] : [];
      for (let col = 0; col < cols.length; col += 1) {
        const token = cols[col];
        if (!isBoardPieceToken(token)) continue;

        const { side, kanji } = parseToken(token);
        if (!kanji) continue;

        const normalizedKanji = normalizeKanjiForPieceLookup(kanji);
        const pieceId = pieceIdByKanji.get(normalizedKanji);
        if (!pieceId) {
          missingKanji.set(kanji, (missingKanji.get(kanji) ?? 0) + 1);
          continue;
        }

        placementRows.push({
          stage_id: stageId,
          side,
          row_no: row,
          col_no: col,
          piece_id: pieceId,
        });

        if (side === 'enemy') {
          enemyCountByKanji.set(normalizedKanji, (enemyCountByKanji.get(normalizedKanji) ?? 0) + 1);
          if (inferBoss(stageNo, kanji, row, col)) {
            enemyBossByKanji.set(normalizedKanji, true);
          }
        }
      }
    }

    for (const [kanji, count] of enemyCountByKanji.entries()) {
      const pieceId = pieceIdByKanji.get(kanji);
      if (!pieceId) continue;
      stagePieceRows.push({
        stage_id: stageId,
        piece_id: pieceId,
        role: enemyBossByKanji.get(kanji) ? 'boss' : 'normal',
        weight: count,
      });
    }
  }

  return { stagePieceRows, placementRows, missingKanji };
}

async function main() {
  loadLocalEnv();

  const stageHtml = getStageHtmlPath();
  const stages = parseStagesFromHtml(stageHtml);
  const stageRows = buildStageRows(stages);

  console.log(`[info] Source: ${stageHtml}`);
  console.log(`[info] Parsed stages: ${stages.length}`);

  if (!shouldApply) {
    console.log(`[dry-run] stage rows to upsert: ${stageRows.length}`);
    console.log('[dry-run] Use --apply to write into DB.');
    return;
  }

  for (const rows of chunk(stageRows, 200)) {
    await request('m_stage', {
      method: 'POST',
      query: 'on_conflict=stage_no',
      body: rows,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  const stageAll = await request('m_stage', { query: 'select=stage_id,stage_no&order=stage_no.asc&limit=1000' });
  const pieceAll = await request('m_piece', { query: 'select=piece_id,kanji&limit=1000' });

  const stageIdByNo = new Map(stageAll.map((r) => [r.stage_no, r.stage_id]));
  const pieceIdByKanji = new Map(pieceAll.map((r) => [r.kanji, r.piece_id]));

  const { stagePieceRows, placementRows, missingKanji } = buildStageDetailRows(stages, stageIdByNo, pieceIdByKanji);

  const stageIds = stageRows
    .map((r) => stageIdByNo.get(r.stage_no))
    .filter((v) => Number.isFinite(v));

  for (const ids of chunk(stageIds, 25)) {
    const inList = ids.join(',');
    await request('m_stage_piece', {
      method: 'DELETE',
      query: `stage_id=in.(${inList})`,
      prefer: 'return=minimal',
    });
    await request('m_stage_initial_placement', {
      method: 'DELETE',
      query: `stage_id=in.(${inList})`,
      prefer: 'return=minimal',
    });
  }

  for (const rows of chunk(stagePieceRows, 200)) {
    await request('m_stage_piece', {
      method: 'POST',
      body: rows,
      prefer: 'return=minimal',
    });
  }

  for (const rows of chunk(placementRows, 300)) {
    await request('m_stage_initial_placement', {
      method: 'POST',
      body: rows,
      prefer: 'return=minimal',
    });
  }

  console.log(`[ok] Upserted stages: ${stageRows.length}`);
  console.log(`[ok] Inserted stage pieces: ${stagePieceRows.length}`);
  console.log(`[ok] Inserted initial placements: ${placementRows.length}`);

  if (missingKanji.size > 0) {
    const list = [...missingKanji.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`[warn] Unknown kanji (not found in m_piece): ${list.length}`);
    for (const [k, c] of list.slice(0, 30)) {
      console.log(`  - ${k}: ${c}`);
    }
  }
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
