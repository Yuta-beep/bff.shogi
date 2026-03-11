import { supabaseAdmin } from '@/lib/supabase-admin';

type StageRelation = {
  stage_no?: number | null;
} | null;

type PlayerStageClearRow = {
  m_stage?: StageRelation | StageRelation[];
};

export async function listClearedStageNos(userId: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from('player_stage_clears')
    .select('m_stage:stage_id(stage_no)')
    .eq('player_id', userId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const stage = (row as PlayerStageClearRow).m_stage;
      const relation = Array.isArray(stage) ? stage[0] : stage;
      return relation?.stage_no ?? null;
    })
    .filter((stageNo): stageNo is number => typeof stageNo === 'number' && stageNo >= 1);
}
