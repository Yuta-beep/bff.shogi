import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { resolveUserId } from '@/server/handlers/v1/deck';
import { startStageBattleSession, StageBattleSessionError } from '@/services/stage-battle-session';

type StartStageBattleBody = {
  stageNo?: number;
  clientVersion?: string | null;
};

type StartStageBattleDeps = {
  resolveUserId: typeof resolveUserId;
  startStageBattleSession: typeof startStageBattleSession;
};

export function optionsStageBattleStart() {
  return optionsResponse();
}

export function createPostStageBattleStart(
  deps: StartStageBattleDeps = { resolveUserId, startStageBattleSession },
) {
  return async function postStageBattleStart(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    let body: StartStageBattleBody;
    try {
      body = (await req.json()) as StartStageBattleBody;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    try {
      const result = await deps.startStageBattleSession({
        playerId: userId,
        stageNo: Number(body?.stageNo),
        clientVersion: body?.clientVersion ?? null,
      });
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof StageBattleSessionError) {
        const status =
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'LOCKED'
              ? 403
              : error.code === 'INSUFFICIENT_STAMINA'
                ? 422
                : error.code === 'INVALID_STAGE_NO'
                  ? 400
                  : 500;
        return jsonError(error.code, error.message, status);
      }
      return jsonError(
        'INTERNAL_ERROR',
        error?.message ?? 'Failed to start stage battle session',
        500,
      );
    }
  };
}

export const postStageBattleStart = createPostStageBattleStart();
