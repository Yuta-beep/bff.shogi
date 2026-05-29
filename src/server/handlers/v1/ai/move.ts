import { resolveBearerUserId } from '@/lib/auth';
import { parseAiMoveRequest, AiMoveRequestValidationError } from '@/lib/ai-move-request-parser';
import { AiEngineConnectionError, AiEngineHttpError } from '@/lib/ai-engine-errors';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { isGameOwnedBy } from '@/services/game-access';
import { executeAiTurn } from '@/services/ai-turn';
import { CommitGameMoveError } from '@/services/game-move';

type PostAiMoveDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  isGameOwnedBy: typeof isGameOwnedBy;
  parseAiMoveRequest: typeof parseAiMoveRequest;
  executeAiTurn: typeof executeAiTurn;
};

export function optionsAiMove() {
  return optionsResponse();
}

export function createPostAiMove(
  deps: PostAiMoveDeps = {
    resolveUserId: resolveBearerUserId,
    isGameOwnedBy,
    parseAiMoveRequest,
    executeAiTurn,
  },
) {
  return async function postAiMove(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    try {
      const input = deps.parseAiMoveRequest(body);
      if (!(await deps.isGameOwnedBy(input.gameId, userId))) {
        return jsonError('NOT_FOUND', 'game not found', 404);
      }
      const result = await deps.executeAiTurn(input);
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof AiMoveRequestValidationError) {
        return jsonError('INVALID_REQUEST', error.message, 400);
      }

      if (error instanceof CommitGameMoveError) {
        const status =
          error.code === 'GAME_NOT_FOUND'
            ? 404
            : error.code === 'TURN_MISMATCH' ||
                error.code === 'MOVE_NO_MISMATCH' ||
                error.code === 'STALE_POSITION'
              ? 409
              : 400;
        return jsonError(error.code, error.message, status);
      }

      if (error instanceof AiEngineHttpError) {
        if (error.status >= 400 && error.status < 500) {
          return jsonError('AI_ENGINE_BAD_REQUEST', error.body || error.message, error.status);
        }
        return jsonError('AI_ENGINE_UPSTREAM', error.body || error.message, 502);
      }

      if (error instanceof AiEngineConnectionError) {
        return jsonError('AI_ENGINE_UNREACHABLE', error.message, 502);
      }

      return jsonError('ENGINE_INTERNAL', error?.message ?? 'Failed to get AI move', 500);
    }
  };
}

export const postAiMove = createPostAiMove();
