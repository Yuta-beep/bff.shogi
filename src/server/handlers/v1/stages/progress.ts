import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { listClearedStageNos } from '@/services/stage-progress';

export function optionsStageProgress() {
  return optionsResponse();
}

type GetStageProgressDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  listClearedStageNos: typeof listClearedStageNos;
};

async function resolveUserId(req: Request): Promise<string | null> {
  return resolveBearerUserId(req);
}

export function createGetStageProgress(
  deps: GetStageProgressDeps = { resolveUserId, listClearedStageNos },
) {
  return async function getStageProgress(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    try {
      const clearedStageNos = await deps.listClearedStageNos(userId);
      return jsonOk({ clearedStageNos });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load stage progress', 500);
    }
  };
}

export const getStageProgress = createGetStageProgress();
