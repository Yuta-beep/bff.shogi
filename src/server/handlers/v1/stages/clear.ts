import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { grantStageClearRewards, StageClearRewardError } from '@/services/stage-clear-reward';
import { resolveUserId } from '@/server/handlers/v1/deck';

type StageClearDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  grantStageClearRewards: (userId: string, stageNo: number) => Promise<unknown>;
};

export function optionsStageClear() {
  return optionsResponse();
}

export function createPostStageClear(
  deps: StageClearDeps = { resolveUserId, grantStageClearRewards },
) {
  return async function postStageClear(stageNoRaw: string, req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const stageNo = Number(stageNoRaw);
    if (!Number.isInteger(stageNo) || stageNo <= 0) {
      return jsonError('INVALID_STAGE_NO', 'stageNo must be a positive integer', 400);
    }

    try {
      const result = await deps.grantStageClearRewards(userId, stageNo);
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof StageClearRewardError) {
        if (error.code === 'NOT_FOUND') {
          return jsonError('NOT_FOUND', error.message, 404);
        }
        if (error.code === 'LOCKED') {
          return jsonError('LOCKED', error.message, 403);
        }
      }
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to grant clear reward', 500);
    }
  };
}

export const postStageClear = createPostStageClear();
