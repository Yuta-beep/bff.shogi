import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStageNoByIdMap } from '@/services/stage-master';

export async function listClearedStageNos(userId: string): Promise<number[]> {
  const { data: clears, error: clearsError } = await supabaseAdmin
    .from('player_stage_clears')
    .select('stage_id')
    .eq('player_id', userId);

  if (clearsError) throw clearsError;

  const stageIds = (clears ?? [])
    .map((row) => row.stage_id)
    .filter((stageId): stageId is number => typeof stageId === 'number');

  if (stageIds.length === 0) {
    return [];
  }

  const stageNoById = await getStageNoByIdMap();

  return stageIds
    .map((stageId) => stageNoById.get(stageId) ?? null)
    .filter((stageNo): stageNo is number => typeof stageNo === 'number' && stageNo >= 1);
}
