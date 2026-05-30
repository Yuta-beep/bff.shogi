import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { isPublishedNow } from '@/lib/time';
import { getStageBattleSetup, getStageByNo } from '@/services/stage-master';

type BattleSetupDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  getStageByNo: typeof getStageByNo;
  isPublishedNow: typeof isPublishedNow;
  getStageBattleSetup: typeof getStageBattleSetup;
};

export function optionsBattleSetup() {
  return optionsResponse();
}

export function createGetBattleSetup(
  deps: BattleSetupDeps = {
    resolveUserId: resolveBearerUserId,
    getStageByNo,
    isPublishedNow,
    getStageBattleSetup,
  },
) {
  return async function getBattleSetup(stageNoRaw: string, req?: Request) {
    const stageNo = Number(stageNoRaw);

    if (!Number.isInteger(stageNo) || stageNo <= 0) {
      return jsonError('INVALID_STAGE_NO', 'stageNo must be a positive integer', 400);
    }

    try {
      const stage = await deps.getStageByNo(stageNo);
      if (!stage) {
        return jsonError('NOT_FOUND', `Stage ${stageNo} not found`, 404);
      }
      if (!deps.isPublishedNow(stage)) {
        return jsonError('LOCKED', `Stage ${stageNo} is locked`, 403);
      }

      let userId: string | null = null;
      if (req) {
        userId = await deps.resolveUserId(req);
      }

      const setup = await deps.getStageBattleSetup(stage.stage_id, userId);

      return jsonOk({
        stage: {
          stageNo: stage.stage_no,
          stageName: stage.stage_name,
          clearConditionType: stage.clear_condition_type ?? 'defeat_boss',
          clearConditionParams: stage.clear_condition_params ?? {},
          stageCategory: stage.stage_category ?? 'normal',
        },
        labels: {
          stageLabel: stage.stage_name,
          turnLabel: 'TURN 1',
          handLabel: '持ち駒',
        },
        ...setup,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load battle setup';
      return jsonError('INTERNAL_ERROR', message, 500);
    }
  };
}

export const getBattleSetup = createGetBattleSetup();
