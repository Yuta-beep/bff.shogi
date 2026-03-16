import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { AiEngineConnectionError, AiEngineHttpError } from '@/lib/ai-engine-errors';
import { CommitGameMoveError } from '@/services/game-move';
import { loadGameLegalMoves } from '@/services/game-legal-moves';

type GetGameLegalMovesDeps = {
  loadGameLegalMoves: typeof loadGameLegalMoves;
};

export function optionsGameLegalMoves() {
  return optionsResponse();
}

export function createGetGameLegalMoves(deps: GetGameLegalMovesDeps = { loadGameLegalMoves }) {
  return async function getGameLegalMoves(gameId: string) {
    try {
      const result = await deps.loadGameLegalMoves({ gameId });
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof CommitGameMoveError) {
        const status = error.code === 'GAME_NOT_FOUND' ? 404 : 400;
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

      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load legal moves', 500);
    }
  };
}

export const getGameLegalMoves = createGetGameLegalMoves();
