import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { listPublishedStages } from '@/services/master';

export function optionsStageList() {
  return optionsResponse();
}

export async function getStageList() {
  try {
    const stages = await listPublishedStages();

    return jsonOk({
      stages: stages.map((row) => ({
        stageNo: row.stage_no,
        stageName: row.stage_name,
        unlockStageNo: row.unlock_stage_no,
        difficulty: row.difficulty,
        stageCategory: row.stage_category ?? 'normal',
        clearConditionType: row.clear_condition_type ?? 'defeat_boss',
        clearConditionParams: row.clear_condition_params ?? {},
        recommendedPower: row.recommended_power ?? null,
        staminaCost: row.stamina_cost ?? 0,
        canStart: true
      })),
      note: 'NO_USER_PROGRESS_TABLE_YET'
    });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load stages', 500);
  }
}
