import { supabaseAdmin } from '@/lib/supabase-admin';

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

  const { data: stages, error: stagesError } = await supabaseAdmin
    .schema('master')
    .from('m_stage')
    .select('stage_id,stage_no')
    .in('stage_id', stageIds);

  if (stagesError) throw stagesError;

  const stageNoById = new Map<number, number>(
    (stages ?? [])
      .map((row) => {
        const stageId = row.stage_id;
        const stageNo = row.stage_no;
        if (typeof stageId !== 'number' || typeof stageNo !== 'number') {
          return null;
        }
        return [stageId, stageNo] as const;
      })
      .filter((entry): entry is readonly [number, number] => entry !== null),
  );

  return stageIds
    .map((stageId) => stageNoById.get(stageId) ?? null)
    .filter((stageNo): stageNo is number => typeof stageNo === 'number' && stageNo >= 1);
}
