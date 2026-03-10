#!/usr/bin/env node
import crypto from 'node:crypto';
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

const htmlCandidates = [
  path.resolve(backendRoot, '../../SHOGI_GAME/piece_info.html'),
  path.resolve(backendRoot, '../../../SHOGI_GAME/piece_info.html'),
];

function findExistingPath(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function extractArrayLiteral(htmlText, constName) {
  const marker = `const ${constName} = [`;
  const start = htmlText.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${constName} in HTML.`);
  }

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

  throw new Error(`Could not parse array literal for ${constName}.`);
}

function parsePiecesFromHtml(htmlPath) {
  const htmlText = fs.readFileSync(htmlPath, 'utf8');
  const arrayLiteral = extractArrayLiteral(htmlText, 'ALL_PIECES_DATA');
  const parsed = Function(`"use strict"; return (${arrayLiteral});`)();

  if (!Array.isArray(parsed)) {
    throw new Error('Parsed ALL_PIECES_DATA is not an array.');
  }

  return parsed
    .filter((p) => p && typeof p === 'object' && p.char && p.name)
    .map((p) => ({
      kanji: String(p.char).trim(),
      name: String(p.name).trim(),
      moveCode: p.move ? String(p.move).trim() : 'custom_unknown',
      skillDesc: p.skill ? String(p.skill).trim() : null,
    }));
}

function normalizePieces(rawPieces) {
  const seen = new Set();
  const deduped = [];
  const duplicates = [];

  for (const p of rawPieces) {
    if (!p.kanji) continue;
    if (seen.has(p.kanji)) {
      duplicates.push(p.kanji);
      continue;
    }
    seen.add(p.kanji);
    deduped.push(p);
  }

  if (duplicates.length > 0) {
    const unique = [...new Set(duplicates)].join(', ');
    console.warn(`[warn] Duplicate kanji detected and skipped (kept first): ${unique}`);
  }

  return deduped;
}

function hash12(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function makePieceCode(piece) {
  return `piece_${hash12(`${piece.kanji}:${piece.name}:${piece.moveCode}`)}`;
}

const KNOWN_MOVE_DEFS = {
  pawn: { isRepeatable: false, canJump: false, vectors: [[0, -1, 1, false, false]] },
  lance: { isRepeatable: true, canJump: false, vectors: [[0, -1, 8, false, false]] },
  knight: {
    isRepeatable: false,
    canJump: true,
    vectors: [
      [-1, -2, 1, false, false],
      [1, -2, 1, false, false],
    ],
  },
  silver: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [-1, -1, 1, false, false],
      [0, -1, 1, false, false],
      [1, -1, 1, false, false],
      [-1, 1, 1, false, false],
      [1, 1, 1, false, false],
    ],
  },
  gold: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [-1, -1, 1, false, false],
      [0, -1, 1, false, false],
      [1, -1, 1, false, false],
      [-1, 0, 1, false, false],
      [1, 0, 1, false, false],
      [0, 1, 1, false, false],
    ],
  },
  bishop: {
    isRepeatable: true,
    canJump: false,
    vectors: [
      [-1, -1, 8, false, false],
      [1, -1, 8, false, false],
      [-1, 1, 8, false, false],
      [1, 1, 8, false, false],
    ],
  },
  rook: {
    isRepeatable: true,
    canJump: false,
    vectors: [
      [0, -1, 8, false, false],
      [0, 1, 8, false, false],
      [-1, 0, 8, false, false],
      [1, 0, 8, false, false],
    ],
  },
  king: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [-1, -1, 1, false, false],
      [0, -1, 1, false, false],
      [1, -1, 1, false, false],
      [-1, 0, 1, false, false],
      [1, 0, 1, false, false],
      [-1, 1, 1, false, false],
      [0, 1, 1, false, false],
      [1, 1, 1, false, false],
    ],
  },
  run: { isRepeatable: true, canJump: false, vectors: [[0, -1, 2, false, false]] },
  p: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [0, -1, 1, false, false],
      [0, 1, 1, false, false],
      [-1, 0, 1, false, false],
      [1, 0, 1, false, false],
    ],
  },
  dance: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [-1, -1, 1, false, false],
      [0, -1, 1, false, false],
      [1, -1, 1, false, false],
      [-1, 0, 1, false, false],
      [1, 0, 1, false, false],
      [0, 1, 1, false, false],
    ],
  },
  cry: {
    isRepeatable: false,
    canJump: false,
    vectors: [
      [-1, -1, 1, false, false],
      [0, -1, 1, false, false],
      [1, -1, 1, false, false],
      [-1, 1, 1, false, false],
      [1, 1, 1, false, false],
    ],
  },
};

function buildMovePatterns(pieces) {
  const map = new Map();

  for (const p of pieces) {
    const code = p.moveCode || 'custom_unknown';
    if (map.has(code)) continue;

    const known = KNOWN_MOVE_DEFS[code];
    if (known) {
      map.set(code, {
        moveCode: code,
        moveName: code,
        isRepeatable: known.isRepeatable,
        canJump: known.canJump,
        constraintsJson: null,
        vectors: known.vectors,
      });
    } else {
      map.set(code, {
        moveCode: code,
        moveName: code,
        isRepeatable: false,
        canJump: false,
        constraintsJson: { mode: 'custom', source_move_code: code },
        vectors: [[0, -1, 1, false, false]],
      });
    }
  }

  return [...map.values()];
}

function buildSkills(pieces) {
  const skillMap = new Map();

  for (const p of pieces) {
    if (!p.skillDesc || p.skillDesc === 'なし' || p.skillDesc === '-') continue;
    if (skillMap.has(p.skillDesc)) continue;

    skillMap.set(p.skillDesc, {
      skillCode: `skill_${hash12(p.skillDesc)}`,
      skillName: `Skill ${hash12(p.skillDesc).slice(0, 6)}`,
      skillDesc: p.skillDesc,
      triggerTiming: null,
    });
  }

  return skillMap;
}

function generateSql(pieces, movePatterns, skills) {
  const header = `-- Generated by scripts/seed-master-piece-from-html.mjs\n-- Source: SHOGI_GAME/piece_info.html (ALL_PIECES_DATA)\n\nbegin;\n`;

  const moveRows = movePatterns
    .map(
      (m) =>
        `(${escapeSql(m.moveCode)}, ${escapeSql(m.moveName)}, ${m.isRepeatable}, ${m.canJump}, ${escapeSql(m.constraintsJson ? JSON.stringify(m.constraintsJson) : null)}::jsonb, true, now(), now())`,
    )
    .join(',\n  ');

  const moveSql = `
insert into master.m_move_pattern (
  move_code,
  move_name,
  is_repeatable,
  can_jump,
  constraints_json,
  is_active,
  created_at,
  updated_at
)
values
  ${moveRows}
on conflict (move_code) do update
set
  move_name = excluded.move_name,
  is_repeatable = excluded.is_repeatable,
  can_jump = excluded.can_jump,
  constraints_json = excluded.constraints_json,
  is_active = true,
  updated_at = now();
`;

  const vectorRows = movePatterns
    .flatMap((m) =>
      m.vectors.map(
        (v) => `(${escapeSql(m.moveCode)}, ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]})`,
      ),
    )
    .join(',\n  ');

  const vectorSql = `
insert into master.m_move_pattern_vector (
  move_pattern_id,
  dx,
  dy,
  max_step,
  capture_only,
  move_only
)
select
  mp.move_pattern_id,
  v.dx,
  v.dy,
  v.max_step,
  v.capture_only,
  v.move_only
from (
  values
  ${vectorRows}
) as v(move_code, dx, dy, max_step, capture_only, move_only)
join master.m_move_pattern mp on mp.move_code = v.move_code
on conflict (move_pattern_id, dx, dy, capture_only, move_only)
do update set
  max_step = excluded.max_step;
`;

  const skillValues = [...skills.values()]
    .map(
      (s) =>
        `(${escapeSql(s.skillCode)}, ${escapeSql(s.skillName)}, ${escapeSql(s.skillDesc)}, ${escapeSql(s.triggerTiming)}, true, now(), now())`,
    )
    .join(',\n  ');

  const skillSql = skillValues
    ? `
insert into master.m_skill (
  skill_code,
  skill_name,
  skill_desc,
  trigger_timing,
  is_active,
  created_at,
  updated_at
)
values
  ${skillValues}
on conflict (skill_code) do update
set
  skill_name = excluded.skill_name,
  skill_desc = excluded.skill_desc,
  trigger_timing = excluded.trigger_timing,
  is_active = true,
  updated_at = now();
`
    : '\n-- No non-empty skills found.\n';

  const pieceValues = pieces
    .map((p) => {
      const skillCode =
        p.skillDesc && p.skillDesc !== 'なし' && p.skillDesc !== '-'
          ? `skill_${hash12(p.skillDesc)}`
          : null;
      return `(${escapeSql(makePieceCode(p))}, ${escapeSql(p.kanji)}, ${escapeSql(p.name)}, ${escapeSql(p.moveCode)}, ${escapeSql(skillCode)})`;
    })
    .join(',\n  ');

  const pieceSql = `
insert into master.m_piece (
  piece_code,
  kanji,
  name,
  move_pattern_id,
  skill_id,
  is_active,
  created_at,
  updated_at
)
select
  v.piece_code,
  v.kanji,
  v.name,
  mp.move_pattern_id,
  sk.skill_id,
  true,
  now(),
  now()
from (
  values
  ${pieceValues}
) as v(piece_code, kanji, name, move_code, skill_code)
join master.m_move_pattern mp on mp.move_code = v.move_code
left join master.m_skill sk on sk.skill_code = v.skill_code
on conflict (kanji)
do update set
  piece_code = excluded.piece_code,
  name = excluded.name,
  move_pattern_id = excluded.move_pattern_id,
  skill_id = excluded.skill_id,
  is_active = true,
  updated_at = now();
`;

  const footer = '\ncommit;\n';

  return `${header}${moveSql}${vectorSql}${skillSql}${pieceSql}${footer}`;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function buildSupabaseRestClient() {
  const baseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  async function request(
    pathname,
    { method = 'GET', body, query = '', schema = 'master', prefer } = {},
  ) {
    const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${pathname}${query ? `?${query}` : ''}`;
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      'Accept-Profile': schema,
      'Content-Profile': schema,
    };
    if (prefer) headers.Prefer = prefer;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`REST ${method} ${pathname} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  return { request };
}

async function applyViaSupabaseRest({ pieces, movePatterns, skills }) {
  const { request } = buildSupabaseRestClient();
  const nowIso = new Date().toISOString();

  const moveRows = movePatterns.map((m) => ({
    move_code: m.moveCode,
    move_name: m.moveName,
    is_repeatable: m.isRepeatable,
    can_jump: m.canJump,
    constraints_json: m.constraintsJson,
    is_active: true,
    updated_at: nowIso,
  }));

  await request('m_move_pattern', {
    method: 'POST',
    query: 'on_conflict=move_code',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: moveRows,
  });

  const movePatternAll = await request('m_move_pattern', {
    query: 'select=move_pattern_id,move_code&limit=1000',
  });
  const moveIdByCode = new Map(movePatternAll.map((r) => [r.move_code, r.move_pattern_id]));

  const vectorRows = movePatterns.flatMap((m) => {
    const movePatternId = moveIdByCode.get(m.moveCode);
    if (!movePatternId) {
      throw new Error(`move_pattern_id not found for move_code=${m.moveCode}`);
    }
    return m.vectors.map((v) => ({
      move_pattern_id: movePatternId,
      dx: v[0],
      dy: v[1],
      max_step: v[2],
      capture_only: v[3],
      move_only: v[4],
    }));
  });

  for (const c of chunk(vectorRows, 500)) {
    await request('m_move_pattern_vector', {
      method: 'POST',
      query: 'on_conflict=move_pattern_id,dx,dy,capture_only,move_only',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: c,
    });
  }

  const skillRows = [...skills.values()].map((s) => ({
    skill_code: s.skillCode,
    skill_name: s.skillName,
    skill_desc: s.skillDesc,
    trigger_timing: s.triggerTiming,
    is_active: true,
    updated_at: nowIso,
  }));
  if (skillRows.length > 0) {
    await request('m_skill', {
      method: 'POST',
      query: 'on_conflict=skill_code',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: skillRows,
    });
  }

  const skillAll = await request('m_skill', {
    query: 'select=skill_id,skill_code&limit=1000',
  });
  const skillIdByCode = new Map(skillAll.map((r) => [r.skill_code, r.skill_id]));

  const pieceRows = pieces.map((p) => {
    const movePatternId = moveIdByCode.get(p.moveCode);
    if (!movePatternId) {
      throw new Error(`move_pattern_id not found for piece move_code=${p.moveCode}`);
    }
    const skillCode =
      p.skillDesc && p.skillDesc !== 'なし' && p.skillDesc !== '-'
        ? `skill_${hash12(p.skillDesc)}`
        : null;
    return {
      piece_code: makePieceCode(p),
      kanji: p.kanji,
      name: p.name,
      move_pattern_id: movePatternId,
      skill_id: skillCode ? (skillIdByCode.get(skillCode) ?? null) : null,
      is_active: true,
      updated_at: nowIso,
    };
  });

  for (const c of chunk(pieceRows, 500)) {
    await request('m_piece', {
      method: 'POST',
      query: 'on_conflict=kanji',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: c,
    });
  }
}

async function main() {
  loadLocalEnv();
  const htmlPath = findExistingPath(htmlCandidates);
  if (!htmlPath) {
    throw new Error('piece_info.html not found. Checked: ' + htmlCandidates.join(', '));
  }

  const rawPieces = parsePiecesFromHtml(htmlPath);
  const pieces = normalizePieces(rawPieces);
  const movePatterns = buildMovePatterns(pieces);
  const skills = buildSkills(pieces);

  const sql = generateSql(pieces, movePatterns, skills);
  const outputPath = path.resolve(backendRoot, 'scripts/generated/seed_master_piece.sql');
  fs.writeFileSync(outputPath, sql, 'utf8');

  console.log(`[ok] Generated SQL: ${outputPath}`);
  console.log(
    `[info] Pieces: ${pieces.length}, MovePatterns: ${movePatterns.length}, Skills: ${skills.size}`,
  );

  if (shouldApply) {
    await applyViaSupabaseRest({ pieces, movePatterns, skills });
    console.log('[ok] Data upsert completed via Supabase REST (no psql).');
  } else {
    console.log('[next] Review SQL and run with:');
    console.log(`  ${outputPath}`);
    console.log('  or run this script with --apply to upsert via Supabase REST');
  }
}

main().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
