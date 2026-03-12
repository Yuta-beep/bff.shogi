#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const sourceSql = path.resolve(backendRoot, 'scripts/generated/seed_master_piece.sql');
const outDir = path.resolve(backendRoot, 'data/ability');
const outFile = path.resolve(outDir, 'skill_structured_catalog.json');

function readUniqueSkillDescriptions(sqlText) {
  const re = /\('skill_[^']+',\s*'[^']*',\s*'((?:[^']|'')*)'/g;
  const all = [];
  for (const m of sqlText.matchAll(re)) {
    all.push(m[1].replace(/''/g, "'"));
  }
  return [...new Set(all)];
}

function normalizePercent(text) {
  return text.replace(/％/g, '%');
}

function splitSentences(text) {
  return normalizePercent(text)
    .split('。')
    .map((s) => s.trim())
    .filter(Boolean);
}

function findPercents(text) {
  return [...normalizePercent(text).matchAll(/(\d{1,3})\s*%/g)].map((m) =>
    Math.max(0, Math.min(1, Number(m[1]) / 100)),
  );
}

function findDurationTurns(text) {
  const m = normalizePercent(text).match(/(\d+)\s*ターン/);
  if (!m) return null;
  return Number(m[1]);
}

function inferTrigger(text) {
  const t = normalizePercent(text);
  if (t.includes('取られた時') || t.includes('取られたとき') || t.includes('取られると'))
    return 'on_captured';
  if (
    t.includes('敵駒を取った時') ||
    t.includes('敵駒を取ったとき') ||
    t.includes('取ったとき') ||
    t.includes('取った時') ||
    t.includes('取ると')
  )
    return 'on_capture';
  if (t.includes('移動後')) return 'after_move';
  if (t.includes('移動時')) return 'on_move';
  if (t.includes('ターンごと')) return 'on_turn_start';
  if (t.includes('隣接する駒が動いたら')) return 'on_other_piece_move';
  if (t.includes('他の味方駒が取られたとき')) return 'on_ally_captured';
  return 'passive';
}

function inferTarget(text) {
  if (text.includes('周囲8マス')) return 'adjacent_8';
  if (text.includes('周囲')) return 'adjacent_area';
  if (text.includes('左右')) return 'left_right';
  if (text.includes('正面')) return 'front_enemy';
  if (text.includes('同じ行や列')) return 'same_row_or_col';
  if (text.includes('同じ行')) return 'same_row';
  if (text.includes('相手の手持ち')) return 'enemy_hand';
  if (text.includes('持ち駒')) return 'hand_piece';
  if (text.includes('味方駒')) return 'ally_piece';
  if (text.includes('敵駒')) return 'enemy_piece';
  if (text.includes('空きマス') || text.includes('盤面') || text.includes('マス'))
    return 'board_cell';
  if (text.includes('自分')) return 'self';
  return 'unspecified';
}

function inferEffectType(sentence) {
  const s = normalizePercent(sentence);
  if (s.includes('召喚') || s.includes('出現')) return 'summon_piece';
  if (s.includes('変身') || s.includes('変化')) return 'transform_piece';
  if (s.includes('消滅')) return 'remove_piece';
  if (s.includes('行動不能') || s.includes('動けなく')) return 'apply_status';
  if (
    s.includes('押し流す') ||
    s.includes('押し出す') ||
    s.includes('遠ざける') ||
    s.includes('移動させる')
  )
    return 'forced_move';
  if (s.includes('封印') || s.includes('阻害')) return 'seal_skill';
  if (s.includes('獲得')) return 'gain_piece';
  if (s.includes('コピー')) return 'copy_ability';
  if (s.includes('継承')) return 'inherit_ability';
  if (
    s.includes('移動範囲') ||
    s.includes('移動能力') ||
    s.includes('移動可能') ||
    s.includes('移動不可') ||
    s.includes('継続移動')
  )
    return 'modify_movement';
  if (
    s.includes('回避') ||
    s.includes('取られない') ||
    s.includes('攻撃できない') ||
    s.includes('無敵')
  )
    return 'defense_or_immunity';
  if (s.includes('無効化')) return 'disable_piece';
  if (
    s.includes('毒マス') ||
    s.includes('×マス') ||
    s.includes('侵入不可') ||
    s.includes('茨化') ||
    s.includes('穴')
  )
    return 'board_hazard';
  if (s.includes('復活')) return 'revive';
  if (s.includes('身代わり')) return 'substitute';
  if (s.includes('もう一度') || s.includes('2回行動')) return 'extra_action';
  if (s.includes('すべて取る') || s.includes('まとめて取る')) return 'multi_capture';
  if (s.includes('取れない')) return 'capture_constraint';
  if (s.includes('連携') || s.includes('連動')) return 'linked_action';
  return 'scripted';
}

function inferScriptHook(desc) {
  const s = normalizePercent(desc);
  if (s.includes('覚醒') || s.includes('変身')) return 'hook_awaken_transform';
  if (s.includes('壁で反射')) return 'hook_reflect_move';
  if (s.includes('連携移動') || s.includes('連動して動く')) return 'hook_linked_movement';
  if (s.includes('ターンごとに移動能力が変化')) return 'hook_dynamic_move_per_turn';
  if (s.includes('画数が10画以上')) return 'hook_stroke_count_rule';
  if (s.includes('相手が移動させた駒と同じ移動範囲')) return 'hook_copy_last_enemy_move';
  if (s.includes('後ろに移動した分前に行ける')) return 'hook_momentum_move';
  if (s.includes('2×2領域')) return 'hook_area_capture_2x2';
  return null;
}

function normalizeSkillType(value) {
  if (value === 'active_or_passive') return value;
  if (value === 'passive') return 'active_or_passive';
  if (value === 'active_or_triggered') return 'active_or_passive';
  return 'active_or_passive';
}

const MANUAL_SKILL_OVERRIDES = {
  '敵駒を取るときは駒を1つまたぐ。': {
    skillType: 'active_or_triggered',
    targetRule: 'enemy_piece',
    effectSummaryType: 'capture_with_leap',
    triggerTiming: 'on_capture_attempt',
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'capture_with_leap',
        targetRule: 'enemy_piece',
        triggerTiming: 'on_capture_attempt',
      },
    ],
  },
  '「泉」駒によって覚醒し、「辰」に変身する。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'transform_piece',
    triggerTiming: 'on_condition_met',
    parseStatus: 'rule_only_v2',
    params: { condition: { type: 'ally_piece_exists', kanji: '泉' }, transformToKanji: '辰' },
    effects: [
      {
        effectType: 'transform_piece',
        targetRule: 'self',
        triggerTiming: 'on_condition_met',
        valueText: '条件成立で辰に変身',
      },
    ],
  },
  '移動時20％の確率で相手の手持ち駒を1つ燃やす。': {
    skillType: 'active_or_triggered',
    targetRule: 'enemy_hand',
    effectSummaryType: 'destroy_hand_piece',
    triggerTiming: 'on_move',
    procChance: 0.2,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'destroy_hand_piece',
        targetRule: 'enemy_hand',
        triggerTiming: 'on_move',
        procChance: 0.2,
        valueNum: 1,
      },
    ],
  },
  '壁で反射して継続移動する。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'reflective_movement',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    params: { reflection: true, continueUntilBlocked: true },
    effects: [{ effectType: 'reflective_movement', targetRule: 'self', triggerTiming: 'on_move' }],
  },
  '敵駒に取られたとき、40％の確率で自分の手持ち駒に戻る': {
    skillType: 'active_or_triggered',
    targetRule: 'self',
    effectSummaryType: 'return_to_hand',
    triggerTiming: 'on_captured',
    procChance: 0.4,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'return_to_hand',
        targetRule: 'self',
        triggerTiming: 'on_captured',
        procChance: 0.4,
      },
    ],
  },
  '周囲の敵駒を次の番まで闇で覆う。': {
    skillType: 'passive',
    targetRule: 'adjacent_area',
    effectSummaryType: 'apply_status',
    triggerTiming: 'passive',
    durationTurns: 1,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'apply_status',
        targetRule: 'adjacent_area',
        triggerTiming: 'passive',
        durationTurns: 1,
        radius: 1,
        valueText: 'dark_blind',
      },
    ],
  },
  '左右の「砂」駒と連携移動する。': {
    skillType: 'passive',
    targetRule: 'ally_piece',
    effectSummaryType: 'linked_action',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    params: { requiredAllyKanji: '砂', relativePositions: ['left', 'right'] },
    effects: [
      {
        effectType: 'linked_action',
        targetRule: 'ally_piece',
        triggerTiming: 'on_move',
        valueText: 'sand_link_move',
      },
    ],
  },
  '移動時増殖する。': {
    skillType: 'active_or_triggered',
    targetRule: 'board_cell',
    effectSummaryType: 'summon_piece',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    params: { summonPiece: 'self_clone', placement: 'adjacent_empty' },
    effects: [
      {
        effectType: 'summon_piece',
        targetRule: 'board_cell',
        triggerTiming: 'on_move',
        valueText: 'self_clone',
      },
    ],
  },
  '縦横に1マス移動。敵の移動範囲を1ターン縦横1マスに制限する。': {
    skillType: 'passive',
    targetRule: 'enemy_piece',
    effectSummaryType: 'composite',
    triggerTiming: 'passive',
    durationTurns: 1,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'self',
        triggerTiming: 'passive',
        valueText: 'orthogonal_step_1',
      },
      {
        effectType: 'modify_movement',
        targetRule: 'enemy_piece',
        triggerTiming: 'passive',
        durationTurns: 1,
        valueText: 'restrict_orthogonal_step_1',
      },
    ],
  },
  '周囲の敵駒の行動範囲を上下1マスのみにする。': {
    skillType: 'passive',
    targetRule: 'adjacent_area',
    effectSummaryType: 'modify_movement',
    triggerTiming: 'passive',
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'adjacent_area',
        triggerTiming: 'passive',
        radius: 1,
        valueText: 'restrict_vertical_step_1',
      },
    ],
  },
  '画数が10画以上の敵駒を無効化する。': {
    skillType: 'passive',
    targetRule: 'enemy_piece',
    effectSummaryType: 'disable_piece',
    triggerTiming: 'passive',
    parseStatus: 'rule_only_v2',
    params: { condition: { type: 'kanji_stroke_count_gte', value: 10 } },
    effects: [
      {
        effectType: 'disable_piece',
        targetRule: 'enemy_piece',
        triggerTiming: 'passive',
        valueText: 'if_strokes_gte_10',
      },
    ],
  },
  '移動時左右に岩の障害物を配置する。': {
    skillType: 'active_or_triggered',
    targetRule: 'board_cell',
    effectSummaryType: 'summon_piece',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    params: { summonPieceKanji: '岩', positions: ['left', 'right'], blockMovement: true },
    effects: [
      {
        effectType: 'summon_piece',
        targetRule: 'board_cell',
        triggerTiming: 'on_move',
        valueText: 'place_rock_left_right',
      },
    ],
  },
  '敵駒に取られても相手の持ち駒に加わらない。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'capture_constraint',
    triggerTiming: 'on_captured',
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'capture_constraint',
        targetRule: 'self',
        triggerTiming: 'on_captured',
        valueText: 'not_added_to_enemy_hand',
      },
    ],
  },
  '周囲の敵駒を20％の確率で相手の持ち駒に送る。': {
    skillType: 'passive',
    targetRule: 'adjacent_area',
    effectSummaryType: 'send_to_hand',
    triggerTiming: 'passive',
    procChance: 0.2,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'send_to_hand',
        targetRule: 'adjacent_area',
        triggerTiming: 'passive',
        procChance: 0.2,
        radius: 1,
        valueText: 'to_enemy_hand',
      },
    ],
  },
  'ターンごとに移動能力が変化する。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'modify_movement',
    triggerTiming: 'on_turn_start',
    parseStatus: 'rule_only_v2',
    params: { mode: 'cyclic_movement_pattern' },
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'self',
        triggerTiming: 'on_turn_start',
        valueText: 'cyclic_pattern_change',
      },
    ],
  },
  '移動時後方の味方駒を連れていく。': {
    skillType: 'active_or_triggered',
    targetRule: 'ally_piece',
    effectSummaryType: 'linked_action',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    params: { relativeSource: 'behind', action: 'pull_follow' },
    effects: [
      {
        effectType: 'linked_action',
        targetRule: 'ally_piece',
        triggerTiming: 'on_move',
        valueText: 'pull_ally_behind',
      },
    ],
  },
  '隣接する駒が動いたらそれに連動して動く。': {
    skillType: 'active_or_triggered',
    targetRule: 'self',
    effectSummaryType: 'linked_action',
    triggerTiming: 'on_other_piece_move',
    parseStatus: 'rule_only_v2',
    params: { watchedRange: 'adjacent', reaction: 'follow_move' },
    effects: [
      {
        effectType: 'linked_action',
        targetRule: 'self',
        triggerTiming: 'on_other_piece_move',
        valueText: 'reactive_follow_move',
      },
    ],
  },
  '味方駒を強化し敵駒から取られないようにする(5ターン持続)。味方の「竜」を覚醒させる。': {
    skillType: 'passive',
    targetRule: 'ally_piece',
    effectSummaryType: 'composite',
    triggerTiming: 'passive',
    durationTurns: 5,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'buff',
        targetRule: 'ally_piece',
        triggerTiming: 'passive',
        durationTurns: 5,
        valueText: 'grant_uncapturable',
      },
      {
        effectType: 'transform_piece',
        targetRule: 'ally_piece',
        triggerTiming: 'passive',
        valueText: 'awaken_ryu',
      },
    ],
  },
  '一手前に相手が移動させた駒と同じ移動範囲になる。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'copy_ability',
    triggerTiming: 'on_turn_start',
    parseStatus: 'rule_only_v2',
    params: { source: 'last_enemy_moved_piece', copiedField: 'move_pattern' },
    effects: [
      {
        effectType: 'copy_ability',
        targetRule: 'self',
        triggerTiming: 'on_turn_start',
        valueText: 'copy_last_enemy_move_pattern',
      },
    ],
  },
  '取られると相手駒を感染状態にし2ターン移動不能にする。': {
    skillType: 'active_or_triggered',
    targetRule: 'enemy_piece',
    effectSummaryType: 'apply_status',
    triggerTiming: 'on_captured',
    durationTurns: 2,
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'apply_status',
        targetRule: 'enemy_piece',
        triggerTiming: 'on_captured',
        durationTurns: 2,
        valueText: 'infected_immobilized',
      },
    ],
  },
  '移動後同じ行にいる味方駒の行動範囲が1マス伸びる。': {
    skillType: 'active_or_triggered',
    targetRule: 'ally_piece',
    effectSummaryType: 'modify_movement',
    triggerTiming: 'after_move',
    parseStatus: 'rule_only_v2',
    params: { filter: 'same_row', deltaRange: 1 },
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'ally_piece',
        triggerTiming: 'after_move',
        valueNum: 1,
        valueText: 'extend_range_same_row',
      },
    ],
  },
  '盤面の端まで貫通して移動する。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'modify_movement',
    triggerTiming: 'passive',
    parseStatus: 'rule_only_v2',
    params: { penetratingMove: true, maxRange: 'board_edge' },
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'self',
        triggerTiming: 'passive',
        valueText: 'penetrate_to_edge',
      },
    ],
  },
  '周囲の味方駒のスキル発動確率を30％増加させる。味方の「陰」駒が同じ行や列にいるとき敵駒に取られない。':
    {
      skillType: 'passive',
      targetRule: 'ally_piece',
      effectSummaryType: 'composite',
      triggerTiming: 'passive',
      parseStatus: 'rule_only_v2',
      effects: [
        {
          effectType: 'buff',
          targetRule: 'adjacent_area',
          triggerTiming: 'passive',
          radius: 1,
          valueNum: 0.3,
          valueText: 'skill_proc_chance_up',
        },
        {
          effectType: 'defense_or_immunity',
          targetRule: 'self',
          triggerTiming: 'passive',
          valueText: 'uncapturable_if_ally_yin_same_row_or_col',
        },
      ],
    },
  '後ろに移動した分前に行けるマスが増える。移動途中の駒を全て取る。': {
    skillType: 'active_or_triggered',
    targetRule: 'self',
    effectSummaryType: 'composite',
    triggerTiming: 'on_move',
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'modify_movement',
        targetRule: 'self',
        triggerTiming: 'on_move',
        valueText: 'gain_forward_range_by_backward_steps',
      },
      {
        effectType: 'multi_capture',
        targetRule: 'enemy_piece',
        triggerTiming: 'on_move',
        valueText: 'capture_all_pieces_on_path',
      },
    ],
  },
  '相手から取られない。特殊効果を受けない。移動時に移動先の2×2領域の敵駒をすべて取る。': {
    skillType: 'passive',
    targetRule: 'self',
    effectSummaryType: 'composite',
    triggerTiming: 'passive',
    parseStatus: 'rule_only_v2',
    effects: [
      {
        effectType: 'defense_or_immunity',
        targetRule: 'self',
        triggerTiming: 'passive',
        valueText: 'uncapturable',
      },
      {
        effectType: 'defense_or_immunity',
        targetRule: 'self',
        triggerTiming: 'passive',
        valueText: 'immune_to_special_effects',
      },
      {
        effectType: 'multi_capture',
        targetRule: 'board_cell',
        triggerTiming: 'on_move',
        valueText: 'capture_enemies_in_2x2_at_destination',
      },
    ],
  },
};

function applyManualOverride(desc, baseEntry) {
  const override = MANUAL_SKILL_OVERRIDES[desc];
  if (!override) return baseEntry;

  const effects = (override.effects ?? []).map((fx, idx) => ({
    order: idx + 1,
    triggerTiming: fx.triggerTiming ?? baseEntry.structured.triggerTiming,
    effectType: fx.effectType ?? baseEntry.structured.effectSummaryType,
    targetRule: fx.targetRule ?? baseEntry.structured.targetRule,
    procChance: fx.procChance ?? override.procChance ?? baseEntry.structured.procChance ?? null,
    durationTurns:
      fx.durationTurns ?? override.durationTurns ?? baseEntry.structured.durationTurns ?? null,
    radius: fx.radius ?? null,
    valueNum: fx.valueNum ?? null,
    valueText: fx.valueText ?? desc,
    params: fx.params ?? { sourceSentence: fx.valueText ?? desc },
  }));

  return {
    ...baseEntry,
    structured: {
      ...baseEntry.structured,
      skillType: normalizeSkillType(override.skillType ?? baseEntry.structured.skillType),
      targetRule: override.targetRule ?? baseEntry.structured.targetRule,
      effectSummaryType: override.effectSummaryType ?? baseEntry.structured.effectSummaryType,
      procChance: override.procChance ?? baseEntry.structured.procChance,
      durationTurns: override.durationTurns ?? baseEntry.structured.durationTurns,
      triggerTiming: override.triggerTiming ?? baseEntry.structured.triggerTiming,
      scriptHook: null,
      parseStatus: override.parseStatus ?? 'rule_only_v2',
      params: {
        ...baseEntry.structured.params,
        ...(override.params ?? {}),
      },
      effects,
    },
  };
}

function buildSkillEntry(desc, index) {
  const sentences = splitSentences(desc);
  const percents = findPercents(desc);
  const durationTurns = findDurationTurns(desc);
  const trigger = inferTrigger(desc);
  const targetRule = inferTarget(desc);
  const scriptHook = inferScriptHook(desc);

  const effects = sentences.map((sentence, i) => {
    const effectPercents = findPercents(sentence);
    const chance =
      effectPercents.length > 0 ? effectPercents[0] : percents.length > 0 ? percents[0] : null;
    return {
      order: i + 1,
      triggerTiming: inferTrigger(sentence) === 'passive' ? trigger : inferTrigger(sentence),
      effectType: inferEffectType(sentence),
      targetRule: inferTarget(sentence) === 'unspecified' ? targetRule : inferTarget(sentence),
      procChance: chance,
      durationTurns: findDurationTurns(sentence) ?? durationTurns,
      radius: sentence.includes('周囲8マス') ? 1 : sentence.includes('周囲') ? 1 : null,
      valueNum: null,
      valueText: sentence,
      params: {
        sourceSentence: sentence,
      },
    };
  });

  const effectTypes = [...new Set(effects.map((e) => e.effectType))];
  const summaryType = effectTypes.length === 1 ? effectTypes[0] : 'composite';
  const skillType = normalizeSkillType(trigger === 'passive' ? 'passive' : 'active_or_triggered');

  const baseEntry = {
    id: index + 1,
    skillDesc: desc,
    structured: {
      skillType,
      targetRule,
      effectSummaryType: summaryType,
      procChance: percents.length > 0 ? percents[0] : null,
      durationTurns,
      triggerTiming: trigger,
      scriptHook: null,
      parseStatus: 'rule_only_v2',
      params: {
        source: 'seed_master_piece.sql',
        sentenceCount: sentences.length,
      },
      effects,
    },
  };

  return applyManualOverride(desc, baseEntry);
}

function main() {
  if (!fs.existsSync(sourceSql)) {
    throw new Error(`Source SQL not found: ${sourceSql}`);
  }

  const sqlText = fs.readFileSync(sourceSql, 'utf8');
  const skillDescs = readUniqueSkillDescriptions(sqlText);
  const entries = skillDescs.map((desc, i) => buildSkillEntry(desc, i));

  const output = {
    version: 'skill-structured-v1',
    generatedAt: new Date().toISOString(),
    source: sourceSql,
    totalSkills: entries.length,
    entries,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

  const stats = {
    total: entries.length,
    ruleOnly: entries.filter((e) => e.structured.parseStatus === 'rule_only_v1').length,
    hybrid: entries.filter((e) => e.structured.parseStatus === 'hybrid_rule_and_script_v1').length,
    multiEffect: entries.filter((e) => e.structured.effects.length > 1).length,
  };

  console.log(`[ok] Wrote: ${outFile}`);
  console.log(
    `[info] total=${stats.total}, ruleOnly=${stats.ruleOnly}, hybrid=${stats.hybrid}, multiEffect=${stats.multiEffect}`,
  );
}

try {
  main();
} catch (err) {
  console.error('[error]', err.message);
  process.exit(1);
}
