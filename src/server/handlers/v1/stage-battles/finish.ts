import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { resolveUserId } from '@/server/handlers/v1/deck';
import { finishStageBattleSession, StageBattleSessionError } from '@/services/stage-battle-session';

type FinishStageBattleBody = {
  battleSessionId?: string;
  result?: 'cleared' | 'failed';
  finalSnapshotHash?: string | null;
  finishPayload?: Record<string, unknown>;
};

type FinishStageBattleDeps = {
  resolveUserId: typeof resolveUserId;
  finishStageBattleSession: typeof finishStageBattleSession;
};

export function optionsStageBattleFinish() {
  return optionsResponse();
}

export function createPostStageBattleFinish(
  deps: FinishStageBattleDeps = { resolveUserId, finishStageBattleSession },
) {
  return async function postStageBattleFinish(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    let body: FinishStageBattleBody;
    try {
      body = (await req.json()) as FinishStageBattleBody;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    try {
      const result = await deps.finishStageBattleSession({
        playerId: userId,
        battleSessionId: body?.battleSessionId ?? '',
        result: body?.result as 'cleared' | 'failed',
        finalSnapshotHash: body?.finalSnapshotHash ?? null,
        finishPayload: body?.finishPayload ?? {},
      });
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof StageBattleSessionError) {
        const status =
          error.code === 'SESSION_NOT_FOUND'
            ? 404
            : error.code === 'SESSION_EXPIRED'
              ? 409
              : error.code === 'INVALID_RESULT'
                ? 400
                : 500;
        return jsonError(error.code, error.message, status);
      }
      return jsonError(
        'INTERNAL_ERROR',
        error?.message ?? 'Failed to finish stage battle session',
        500,
      );
    }
  };
}

export const postStageBattleFinish = createPostStageBattleFinish();
