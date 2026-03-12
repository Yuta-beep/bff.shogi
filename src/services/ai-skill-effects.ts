import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { supabaseAdmin } from '@/lib/supabase-admin';

type PieceSkillRow = {
  piece_code: string;
  skill_id: number | null;
};

type SkillEffectRow = {
  skill_id: number;
  effect_order: number;
  effect_type: string;
  target_rule: string;
  trigger_timing: string | null;
  proc_chance: number | null;
  duration_turns: number | null;
  value_num: number | null;
  value_text: string | null;
  params_json: Record<string, unknown> | null;
  is_active: boolean;
};

export async function attachSkillEffectsToAiRequest(input: AiMoveRequest): Promise<AiMoveRequest> {
  const pieceCodes = collectPieceCodesForSkillLookup(input.position);
  if (pieceCodes.size === 0) {
    return withSkillEffects(input, []);
  }

  const { data: pieceRows, error: pieceError } = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select('piece_code,skill_id')
    .eq('is_active', true)
    .in('piece_code', Array.from(pieceCodes));
  if (pieceError) throw pieceError;

  const rows = (pieceRows ?? []) as PieceSkillRow[];
  const skillToPieceCodes = new Map<number, string[]>();
  for (const row of rows) {
    if (!row.skill_id) continue;
    const list = skillToPieceCodes.get(row.skill_id) ?? [];
    if (!list.includes(row.piece_code)) list.push(row.piece_code);
    skillToPieceCodes.set(row.skill_id, list);
  }
  const skillIds = Array.from(skillToPieceCodes.keys());
  if (skillIds.length === 0) {
    return withSkillEffects(input, []);
  }

  const { data: effectRows, error: effectError } = await supabaseAdmin
    .schema('master')
    .from('m_skill_effect')
    .select(
      'skill_id,effect_order,effect_type,target_rule,trigger_timing,proc_chance,duration_turns,value_num,value_text,params_json,is_active',
    )
    .eq('is_active', true)
    .in('skill_id', skillIds)
    .order('skill_id', { ascending: true })
    .order('effect_order', { ascending: true });
  if (effectError) throw effectError;

  const effects = ((effectRows ?? []) as SkillEffectRow[]).flatMap((row) => {
    const pieces = skillToPieceCodes.get(row.skill_id) ?? [];
    return pieces.map((pieceCode) => ({
      skill_id: row.skill_id,
      effect_order: row.effect_order,
      effect_type: row.effect_type,
      target_rule: row.target_rule,
      trigger_timing: row.trigger_timing,
      proc_chance: row.proc_chance,
      duration_turns: row.duration_turns,
      value_num: row.value_num,
      value_text: row.value_text,
      params_json: row.params_json ?? {},
      is_active: row.is_active,
      piece_code: pieceCode,
      source_piece_code: pieceCode,
    }));
  });

  return withSkillEffects(input, effects);
}

function withSkillEffects(input: AiMoveRequest, effects: Record<string, unknown>[]): AiMoveRequest {
  const boardState = {
    ...input.position.boardState,
    skills_enabled: effects.length > 0,
    skill_effects: effects,
  };
  return {
    ...input,
    position: {
      ...input.position,
      boardState,
    },
  };
}

export function collectPieceCodesForSkillLookup(position: AiMoveRequest['position']): Set<string> {
  const set = new Set<string>();

  for (const code of extractPieceCodesFromSfen(position.sfen ?? null)) set.add(code);
  for (const mv of position.legalMoves) {
    if (mv.pieceCode) set.add(mv.pieceCode.toUpperCase());
    if (mv.dropPieceCode) set.add(mv.dropPieceCode.toUpperCase());
  }

  return set;
}

export function extractPieceCodesFromSfen(sfen: string | null): Set<string> {
  const out = new Set<string>();
  if (!sfen) return out;
  const board = sfen.split(' ')[0] ?? '';
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '9')) continue;
    if (ch === '+') continue;
    const code = sfenCharToPieceCode(ch);
    if (code) out.add(code);
  }
  return out;
}

function sfenCharToPieceCode(ch: string): string | null {
  switch (ch.toUpperCase()) {
    case 'P':
      return 'FU';
    case 'L':
      return 'KY';
    case 'N':
      return 'KE';
    case 'S':
      return 'GI';
    case 'G':
      return 'KI';
    case 'B':
      return 'KA';
    case 'R':
      return 'HI';
    case 'K':
      return 'OU';
    default:
      return null;
  }
}
