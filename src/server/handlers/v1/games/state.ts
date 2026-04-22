import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { CommitGameMoveError, loadGameState } from '@/services/game-move';

type GetGameStateDeps = {
  loadGameState: typeof loadGameState;
};

export function optionsGameState() {
  return optionsResponse();
}

export function createGetGameState(deps: GetGameStateDeps = { loadGameState }) {
  return async function getGameState(gameId: string) {
    try {
      const result = await deps.loadGameState(gameId);
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof CommitGameMoveError) {
        const status = error.code === 'GAME_NOT_FOUND' ? 404 : 400;
        return jsonError(error.code, error.message, status);
      }
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load game state', 500);
    }
  };
}

export const getGameState = createGetGameState();
