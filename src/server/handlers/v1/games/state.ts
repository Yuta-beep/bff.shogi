import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { isGameOwnedBy } from '@/services/game-access';
import { CommitGameMoveError, loadGameState } from '@/services/game-move';

type GetGameStateDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  isGameOwnedBy: typeof isGameOwnedBy;
  loadGameState: typeof loadGameState;
};

export function optionsGameState() {
  return optionsResponse();
}

export function createGetGameState(
  deps: GetGameStateDeps = { resolveUserId: resolveBearerUserId, isGameOwnedBy, loadGameState },
) {
  return async function getGameState(req: Request, gameId: string) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    if (!(await deps.isGameOwnedBy(gameId, userId))) {
      return jsonError('NOT_FOUND', 'game not found', 404);
    }

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
