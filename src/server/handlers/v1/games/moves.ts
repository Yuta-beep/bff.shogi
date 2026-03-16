import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import {
  parseGameMoveRequest,
  GameMoveRequestValidationError,
} from '@/lib/game-move-request-parser';
import { commitGameMove, CommitGameMoveError } from '@/services/game-move';

type PostGameMoveDeps = {
  parseGameMoveRequest: typeof parseGameMoveRequest;
  commitGameMove: typeof commitGameMove;
};

export function optionsGameMove() {
  return optionsResponse();
}

export function createPostGameMove(
  deps: PostGameMoveDeps = { parseGameMoveRequest, commitGameMove },
) {
  return async function postGameMove(gameId: string, req: Request) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    try {
      const input = deps.parseGameMoveRequest(body);
      const result = await deps.commitGameMove({
        gameId,
        moveNo: input.moveNo,
        actorSide: input.actorSide,
        move: input.move,
        stateHash: input.stateHash,
      });
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof GameMoveRequestValidationError) {
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
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to commit move', 500);
    }
  };
}

export const postGameMove = createPostGameMove();
