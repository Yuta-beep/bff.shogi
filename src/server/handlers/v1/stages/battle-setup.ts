import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { isPublishedNow } from '@/lib/time';
import { getStageBattleSetup, getStageByNo } from '@/services/master';

export function optionsBattleSetup() {
  return optionsResponse();
}

export async function getBattleSetup(stageNoRaw: string) {
  const stageNo = Number(stageNoRaw);

  if (!Number.isInteger(stageNo) || stageNo <= 0) {
    return jsonError('INVALID_STAGE_NO', 'stageNo must be a positive integer', 400);
  }

  try {
    const stage = await getStageByNo(stageNo);
    if (!stage) {
      return jsonError('NOT_FOUND', `Stage ${stageNo} not found`, 404);
    }
    if (!isPublishedNow(stage)) {
      return jsonError('LOCKED', `Stage ${stageNo} is locked`, 403);
    }

    const setup = await getStageBattleSetup(stage.stage_id);

    return jsonOk({
      stage: {
        stageNo: stage.stage_no,
        stageName: stage.stage_name,
        clearConditionType: stage.clear_condition_type ?? 'defeat_boss',
        clearConditionParams: stage.clear_condition_params ?? {},
        stageCategory: stage.stage_category ?? 'normal'
      },
      labels: {
        stageLabel: `STAGE ${stage.stage_no}`,
        turnLabel: 'TURN 1',
        handLabel: '持ち駒'
      },
      ...setup
    });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load battle setup', 500);
  }
}
