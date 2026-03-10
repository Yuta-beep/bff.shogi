import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createGameSession, CreateGameSessionError } from '@/services/game-session';

type CreateGameRequest = {
  playerId: string;
  stageNo?: number;
  initialPosition?: {
    sideToMove?: 'player' | 'enemy';
    turnNumber?: number;
    moveCount?: number;
    sfen?: string | null;
    stateHash?: string | null;
    boardState?: Record<string, unknown>;
    hands?: Record<string, unknown>;
  };
};

export function optionsCreateGame() {
  return optionsResponse();
}

type PostCreateGameDeps = {
  resolveStageId: (stageNo?: number) => Promise<number | null>;
  createGameSession: typeof createGameSession;
};

export function createPostCreateGame(
  deps: PostCreateGameDeps = { resolveStageId, createGameSession }
) {
  return async function postCreateGame(req: Request) {
    let body: CreateGameRequest;
    try {
      body = (await req.json()) as CreateGameRequest;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    const playerId = body?.playerId;
    if (!playerId || typeof playerId !== 'string') {
      return jsonError('INVALID_PLAYER_ID', 'playerId is required', 400);
    }

    try {
      const stageId = await deps.resolveStageId(body.stageNo);
      const session = await deps.createGameSession({
        playerId,
        stageId,
        initialPosition: body.initialPosition,
      });

      return jsonOk(session);
    } catch (error: any) {
      if (error instanceof CreateGameSessionError) {
        return jsonError(error.code, error.message, 500);
      }
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to create game', 500);
    }
  };
}

export const postCreateGame = createPostCreateGame();

async function resolveStageId(stageNo?: number): Promise<number | null> {
  if (!Number.isInteger(stageNo) || (stageNo ?? 0) <= 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .schema('master')
    .from('m_stage')
    .select('stage_id')
    .eq('stage_no', stageNo)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.stage_id ?? null;
}
