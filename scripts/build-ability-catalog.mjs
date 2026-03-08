#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const outDir = path.resolve(backendRoot, 'data/ability');

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
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return htmlText.slice(arrayStart, i + 1);
    }
  }

  throw new Error(`Could not parse ${constName}`);
}

function parsePiecesFromHtml(htmlPath) {
  const htmlText = fs.readFileSync(htmlPath, 'utf8');
  const arrayLiteral = extractArrayLiteral(htmlText, 'ALL_PIECES_DATA');
  const parsed = Function(`"use strict"; return (${arrayLiteral});`)();
  if (!Array.isArray(parsed)) throw new Error('ALL_PIECES_DATA is not array');

  const seen = new Set();
  const duplicates = [];
  const pieces = [];

  for (const p of parsed) {
    if (!p || typeof p !== 'object' || !p.char || !p.name) continue;
    const kanji = String(p.char).trim();
    if (seen.has(kanji)) {
      duplicates.push(kanji);
      continue;
    }
    seen.add(kanji);
    pieces.push({
      kanji,
      name: String(p.name).trim(),
      unlock: p.unlock ? String(p.unlock).trim() : null,
      moveCode: p.move ? String(p.move).trim() : 'custom_unknown',
      skillText: p.skill ? String(p.skill).trim() : 'なし',
      desc: p.desc ? String(p.desc).trim() : null,
    });
  }

  if (duplicates.length > 0) {
    const uniq = [...new Set(duplicates)].join(', ');
    console.warn(`[warn] Duplicate kanji skipped (kept first): ${uniq}`);
  }

  return pieces;
}

const MOVE_DEFS = {
  pawn: { kind: 'step', repeatable: false, jump: false, vectors: [[0, -1, 1]] },
  lance: { kind: 'ray', repeatable: true, jump: false, vectors: [[0, -1, 8]] },
  knight: { kind: 'jump', repeatable: false, jump: true, vectors: [[-1, -2, 1], [1, -2, 1]] },
  silver: { kind: 'step', repeatable: false, jump: false, vectors: [[-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
  gold: { kind: 'step', repeatable: false, jump: false, vectors: [[-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 0, 1], [1, 0, 1], [0, 1, 1]] },
  bishop: { kind: 'ray', repeatable: true, jump: false, vectors: [[-1, -1, 8], [1, -1, 8], [-1, 1, 8], [1, 1, 8]] },
  rook: { kind: 'ray', repeatable: true, jump: false, vectors: [[0, -1, 8], [0, 1, 8], [-1, 0, 8], [1, 0, 8]] },
  king: { kind: 'step', repeatable: false, jump: false, vectors: [[-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 0, 1], [1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1]] },
  run: { kind: 'step', repeatable: true, jump: false, vectors: [[0, -1, 2]] },
  p: { kind: 'step', repeatable: false, jump: false, vectors: [[0, -1, 1], [0, 1, 1], [-1, 0, 1], [1, 0, 1]] },
  dance: { kind: 'step', repeatable: false, jump: false, vectors: [[-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 0, 1], [1, 0, 1], [0, 1, 1]] },
  cry: { kind: 'step', repeatable: false, jump: false, vectors: [[-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
};

const SCRIPT_HOOK_BY_KANJI = {
  爆: 'triggerBombExplosion',
  逃: 'triggerEscapeSkill',
  室: 'triggerSafeRoomSkill',
  定: 'triggerFixedSkill',
  安: 'triggerAnSkill',
  宋: 'triggerSongSkill',
  火: 'triggerFireBurnSkill',
  風: 'triggerWindSkill',
  泉: 'triggerSpringSkill',
  滝: 'triggerWaterfallSkill',
  剣: 'triggerSwordSkill',
  銃: 'triggerGunPenetrationSkill',
  魚: 'triggerFishDrowningSkill',
  虹: 'triggerRainbowSkill',
  沼: 'triggerSwampSkill',
  鏡: 'triggerMirrorSkill',
  映: 'triggerReflectionSkill',
  牢: 'triggerPrisonSkill',
  柵: 'triggerFenceSkill',
  嶺: 'triggerRidgeSkill',
  峰: 'triggerPeakSkill',
  岩: 'triggerRockSkill',
  鉱: 'triggerOreSkill',
  墓: 'triggerGraveSkill',
  光: 'triggerLightSkill',
  霧: 'triggerMistSkill',
  舟: 'triggerBoatSkill',
  機: 'triggerMachineSkill',
  あ: 'triggerAhSkill',
  鬱: 'triggerDepressionSkill',
  乙: 'triggerSecondMoveSkill',
  薔: 'triggerRoseThornSkill',
  菊: 'triggerChrysanthemumRevivalSkill',
  桜: 'triggerCherryRangeBoostSkill',
  辰: 'triggerDragonAwakenedSkill',
  K: 'triggerKSkill',
};

function parseChance(text) {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const v = Number(m[1]);
  if (Number.isNaN(v)) return null;
  return Math.max(0, Math.min(1, v / 100));
}

function inferEffectType(text) {
  if (!text || text === 'なし') return 'none';
  if (text.includes('行動不能') || text.includes('動けなく')) return 'status_apply';
  if (text.includes('召喚') || text.includes('出現')) return 'summon';
  if (text.includes('変化') || text.includes('変身')) return 'transform';
  if (text.includes('移動範囲') || text.includes('移動不可') || text.includes('移動')) return 'movement_control';
  if (text.includes('消滅') || text.includes('取る')) return 'damage_or_remove';
  if (text.includes('回復') || text.includes('強化') || text.includes('無敵')) return 'buff';
  return 'scripted';
}

function inferTargetRule(text) {
  if (!text || text === 'なし') return 'none';
  if (text.includes('周囲')) return 'adjacent_area';
  if (text.includes('敵駒')) return 'enemy_piece';
  if (text.includes('味方')) return 'ally_piece';
  if (text.includes('ランダム')) return 'random';
  return 'unspecified';
}

function inferTriggerTiming(text) {
  if (!text || text === 'なし') return 'none';
  if (text.includes('取られた時') || text.includes('取られる')) return 'on_captured';
  if (text.includes('敵駒を取った時') || text.includes('取ったとき')) return 'on_capture';
  if (text.includes('移動時') || text.includes('移動後')) return 'on_move';
  if (text.includes('ターンごと')) return 'on_turn_start';
  return 'passive';
}

function buildCatalog(pieces) {
  return pieces.map((p) => {
    const moveBase = MOVE_DEFS[p.moveCode] || null;
    const chance = parseChance(p.skillText);
    const effectType = inferEffectType(p.skillText);
    const triggerTiming = inferTriggerTiming(p.skillText);
    const targetRule = inferTargetRule(p.skillText);

    const move = moveBase
      ? {
          code: p.moveCode,
          model: moveBase.kind,
          repeatable: moveBase.repeatable,
          canJump: moveBase.jump,
          vectors: moveBase.vectors.map(([dx, dy, maxStep]) => ({ dx, dy, maxStep })),
          needsScript: false,
        }
      : {
          code: p.moveCode,
          model: 'custom',
          repeatable: false,
          canJump: false,
          vectors: [],
          needsScript: true,
        };

    const skill = p.skillText === 'なし'
      ? {
          code: null,
          description: p.skillText,
          triggerTiming: 'none',
          effectType: 'none',
          targetRule: 'none',
          procChance: null,
          params: {},
          scriptHook: null,
          parseStatus: 'complete',
        }
      : {
          code: `skill_${Buffer.from(p.kanji).toString('hex')}`,
          description: p.skillText,
          triggerTiming,
          effectType,
          targetRule,
          procChance: chance,
          params: {
            source: 'heuristic_parse_v1',
          },
          scriptHook: SCRIPT_HOOK_BY_KANJI[p.kanji] ?? null,
          parseStatus: SCRIPT_HOOK_BY_KANJI[p.kanji] ? 'hybrid_rule_and_script' : 'rule_only_needs_review',
        };

    return {
      piece: {
        kanji: p.kanji,
        name: p.name,
        unlock: p.unlock,
      },
      move,
      skill,
      meta: {
        source: 'piece_info.html:ALL_PIECES_DATA',
        notes: p.desc ?? null,
      },
    };
  });
}

function main() {
  const htmlPath = findExistingPath(htmlCandidates);
  if (!htmlPath) {
    throw new Error('piece_info.html not found');
  }

  const pieces = parsePiecesFromHtml(htmlPath);
  const catalog = buildCatalog(pieces);

  const output = {
    version: 'v0.1',
    generatedAt: new Date().toISOString(),
    source: htmlPath,
    totalPieces: catalog.length,
    modelPolicy: {
      move: 'relative_vectors_plus_script_fallback',
      skill: 'structured_fields_plus_script_hook',
    },
    entries: catalog,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.resolve(outDir, 'piece_ability_catalog.json');
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

  const summary = {
    total: catalog.length,
    customMove: catalog.filter((e) => e.move.needsScript).length,
    noSkill: catalog.filter((e) => e.skill.effectType === 'none').length,
    scriptedSkill: catalog.filter((e) => e.skill.scriptHook).length,
  };

  console.log(`[ok] Wrote: ${outFile}`);
  console.log(`[info] total=${summary.total}, customMove=${summary.customMove}, noSkill=${summary.noSkill}, scriptedSkill=${summary.scriptedSkill}`);
}

try {
  main();
} catch (err) {
  console.error('[error]', err.message);
  process.exit(1);
}
