#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const htmlCandidates = [
  path.resolve(backendRoot, '../../SHOGI_GAME/piece_info.html'),
  path.resolve(backendRoot, '../../../SHOGI_GAME/piece_info.html'),
];

const outputPath = path.resolve(
  backendRoot,
  'supabase/migrations/20260311114000_reseed_move_vectors_from_piece_info.sql',
);

function findExistingPath(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function extractArrayLiteral(text, constName) {
  const marker = `const ${constName} = [`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Could not find const ${constName} = [`);

  const arrStart = text.indexOf('[', start);
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = arrStart; i < text.length; i += 1) {
    const ch = text[i];
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
      if (depth === 0) return text.slice(arrStart, i + 1);
    }
  }

  throw new Error(`Could not parse array for ${constName}`);
}

function extractFunctionSource(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${marker}`);
  const braceStart = text.indexOf('{', start);
  if (braceStart < 0) throw new Error(`Could not find body start for ${name}`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
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

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not parse function body for ${name}`);
}

function extractDescriptionsObjectLiteral(text) {
  const fnMarker = 'function displayMovementDescription(moveType) {';
  const fnStart = text.indexOf(fnMarker);
  if (fnStart < 0) throw new Error('Could not find displayMovementDescription');

  const objMarker = 'const descriptions = {';
  const objStartMarker = text.indexOf(objMarker, fnStart);
  if (objStartMarker < 0) throw new Error('Could not find descriptions object');

  const braceStart = text.indexOf('{', objStartMarker);
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
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

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(braceStart, i + 1);
      }
    }
  }

  throw new Error('Could not parse descriptions object literal');
}

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const gcd = (a, b) => {
    let x = a;
    let y = b;
    while (y !== 0) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x;
  };
  const g = gcd(ax, ay);
  return { ux: dx / g, uy: dy / g, step: g };
}

function buildCompressedVectors(allowed) {
  const keySet = new Set(allowed.map((m) => `${m.dx},${m.dy}`));
  const groups = new Map();

  for (const m of allowed) {
    const { ux, uy, step } = normalizeDirection(m.dx, m.dy);
    const key = `${ux},${uy}`;
    if (!groups.has(key)) groups.set(key, { ux, uy, steps: new Set() });
    groups.get(key).steps.add(step);
  }

  const vectors = [];
  for (const g of groups.values()) {
    const steps = [...g.steps].sort((a, b) => a - b);
    const max = steps[steps.length - 1];
    let contiguous = true;
    for (let i = 1; i <= max; i += 1) {
      if (!g.steps.has(i)) {
        contiguous = false;
        break;
      }
    }

    if (contiguous) {
      vectors.push({ dx: g.ux, dy: g.uy, maxStep: max, captureOnly: false, moveOnly: false });
    } else {
      for (const s of steps) {
        vectors.push({
          dx: g.ux * s,
          dy: g.uy * s,
          maxStep: 1,
          captureOnly: false,
          moveOnly: false,
        });
      }
    }
  }

  vectors.sort((a, b) => {
    if (a.dy !== b.dy) return a.dy - b.dy;
    if (a.dx !== b.dx) return a.dx - b.dx;
    return a.maxStep - b.maxStep;
  });

  return vectors;
}

function detectCanJump(allowed) {
  const set = new Set(allowed.map((m) => `${m.dx},${m.dy}`));

  for (const m of allowed) {
    const adx = Math.abs(m.dx);
    const ady = Math.abs(m.dy);
    const dist = Math.max(adx, ady);
    if (dist <= 1) continue;

    const { ux, uy, step } = normalizeDirection(m.dx, m.dy);
    if (step === 1) {
      // Knight-like offset: no linear intermediate cells.
      return true;
    }

    for (let i = 1; i < step; i += 1) {
      const k = `${ux * i},${uy * i}`;
      if (!set.has(k)) return true;
    }
  }

  return false;
}

function toValuesRows(rows, mapper) {
  if (rows.length === 0) return '  (NULL)';
  return rows.map((r) => `  (${mapper(r).join(', ')})`).join(',\n');
}

function main() {
  const htmlPath = findExistingPath(htmlCandidates);
  if (!htmlPath) {
    throw new Error(`piece_info.html not found. candidates=${htmlCandidates.join(', ')}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  const arrayLiteral = extractArrayLiteral(html, 'ALL_PIECES_DATA');
  const allPieces = Function(`"use strict"; return (${arrayLiteral});`)();
  if (!Array.isArray(allPieces)) throw new Error('ALL_PIECES_DATA parse failed');

  const pieces = allPieces
    .filter((p) => p && typeof p === 'object' && p.char && p.move)
    .map((p) => ({
      char: String(p.char),
      move: String(p.move),
    }));

  const uniqueMoves = [...new Set(pieces.map((p) => p.move))].sort();

  const canMoveToMoonOddSrc = extractFunctionSource(html, 'canMoveToMoonOdd');
  const canMoveToMoonEvenSrc = extractFunctionSource(html, 'canMoveToMoonEven');
  const isGoldMoveSrc = extractFunctionSource(html, 'isGoldMove');
  const canMoveToSrc = extractFunctionSource(html, 'canMoveTo');

  const evaluator = Function(
    `${canMoveToMoonOddSrc}\n${canMoveToMoonEvenSrc}\n${isGoldMoveSrc}\n${canMoveToSrc}\nreturn { canMoveTo, canMoveToMoonOdd, canMoveToMoonEven };`,
  )();

  const patterns = [];
  const vectorRows = [];

  for (const moveCode of uniqueMoves) {
    const allowed = [];
    for (let dr = -8; dr <= 8; dr += 1) {
      for (let dc = -8; dc <= 8; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        if (evaluator.canMoveTo(moveCode, dr, dc)) {
          allowed.push({ dx: dc, dy: dr });
        }
      }
    }

    const vectors = buildCompressedVectors(allowed);
    const isRepeatable = vectors.some((v) => v.maxStep > 1);
    const canJump = detectCanJump(allowed);
    const constraintsJson = { mode: 'piece_info_canMoveTo', source_move_code: moveCode };

    patterns.push({ moveCode, isRepeatable, canJump, constraintsJson });

    for (const v of vectors) {
      vectorRows.push({ moveCode, ...v });
    }
  }

  const descriptionsObjLiteral = extractDescriptionsObjectLiteral(html);
  const descriptions = Function(`"use strict"; return (${descriptionsObjLiteral});`)();

  const descriptionRows = [];
  const seenKanji = new Set();
  for (const p of pieces) {
    if (seenKanji.has(p.char)) continue;
    seenKanji.add(p.char);
    const d = descriptions[p.move];
    if (!d) continue;
    descriptionRows.push({ kanji: p.char, moveDescriptionJa: String(d) });
  }

  const ruleRows = [];
  const addRule = (moveCode, ruleType, priority, params) => {
    ruleRows.push({ moveCode, ruleType, priority, paramsJson: params });
  };

  addRule('moon', 'turn_parity_override', 10, {
    odd: { type: 'step_limit', max_step: 1, rays: 'queen' },
    even: { type: 'step_limit', min_step: 2, max_step: 2, rays: 'queen' },
    source: 'piece_info_canMoveToMoonOddEven',
  });
  addRule('mirror', 'copy_front_enemy_move', 10, { source: 'piece_skill_text' });
  addRule('film', 'copy_front_enemy_move', 10, { source: 'piece_skill_text' });
  addRule('book', 'copy_last_enemy_move', 10, { source: 'piece_skill_text' });
  addRule('house', 'immobile', 0, { source: 'piece_info_canMoveTo_false' });
  addRule('field', 'immobile', 0, { source: 'piece_info_canMoveTo_false' });
  addRule('mutant', 'immobile', 0, { source: 'piece_info_canMoveTo_false' });

  const moveCodeRowsSql = toValuesRows(
    uniqueMoves.map((moveCode) => ({ moveCode })),
    (r) => [escapeSql(r.moveCode)],
  );

  const patternRowsSql = toValuesRows(patterns, (r) => [
    escapeSql(r.moveCode),
    r.isRepeatable,
    r.canJump,
    `${escapeSql(JSON.stringify(r.constraintsJson))}::jsonb`,
  ]);

  const vectorRowsSql = toValuesRows(vectorRows, (r) => [
    escapeSql(r.moveCode),
    r.dx,
    r.dy,
    r.maxStep,
    r.captureOnly,
    r.moveOnly,
  ]);

  const descRowsSql = toValuesRows(descriptionRows, (r) => [
    escapeSql(r.kanji),
    escapeSql(r.moveDescriptionJa),
  ]);

  const ruleRowsSql = toValuesRows(ruleRows, (r) => [
    escapeSql(r.moveCode),
    escapeSql(r.ruleType),
    r.priority,
    `${escapeSql(JSON.stringify(r.paramsJson))}::jsonb`,
  ]);

  const sql = `-- Re-seed move vectors from SHOGI_GAME/piece_info.html canMoveTo() definition.
-- Generated by scripts/generate-move-reseed-migration.mjs

begin;

update master.m_move_pattern as mp
set
  is_repeatable = src.is_repeatable,
  can_jump = src.can_jump,
  constraints_json = src.constraints_json,
  updated_at = now()
from (
values
${patternRowsSql}
) as src(move_code, is_repeatable, can_jump, constraints_json)
where mp.move_code = src.move_code;

with target_patterns as (
  select move_pattern_id
  from master.m_move_pattern
  where move_code in (
    select move_code
    from (
      values
${moveCodeRowsSql}
    ) as mc(move_code)
  )
)
delete from master.m_move_pattern_vector as v
using target_patterns as t
where v.move_pattern_id = t.move_pattern_id;

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
  src.dx,
  src.dy,
  src.max_step,
  src.capture_only,
  src.move_only
from (
  values
${vectorRowsSql}
) as src(move_code, dx, dy, max_step, capture_only, move_only)
join master.m_move_pattern as mp
  on mp.move_code = src.move_code;

update master.m_piece as p
set
  move_description_ja = src.move_description_ja,
  updated_at = now()
from (
  values
${descRowsSql}
) as src(kanji, move_description_ja)
where p.kanji = src.kanji;

with target_patterns as (
  select move_pattern_id
  from master.m_move_pattern
  where move_code in (
    select move_code
    from (
      values
${moveCodeRowsSql}
    ) as mc(move_code)
  )
)
delete from master.m_move_pattern_rule as r
using target_patterns as t
where r.move_pattern_id = t.move_pattern_id;

insert into master.m_move_pattern_rule (
  move_pattern_id,
  rule_type,
  priority,
  params_json,
  is_active,
  created_at,
  updated_at
)
select
  mp.move_pattern_id,
  src.rule_type,
  src.priority,
  src.params_json,
  true,
  now(),
  now()
from (
  values
${ruleRowsSql}
) as src(move_code, rule_type, priority, params_json)
join master.m_move_pattern as mp
  on mp.move_code = src.move_code;

commit;
`;

  fs.writeFileSync(outputPath, sql, 'utf8');

  const stats = {
    moves: uniqueMoves.length,
    vectors: vectorRows.length,
    descriptions: descriptionRows.length,
    rules: ruleRows.length,
    outputPath,
  };

  console.log(JSON.stringify(stats, null, 2));
}

main();
