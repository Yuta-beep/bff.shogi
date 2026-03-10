import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

export async function postCreateGame(req: Request) {
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
    const stageId = await resolveStageId(body.stageNo);

    const { data: gameRow, error: gameError } = await supabaseAdmin
      .schema('game')
      .from('games')
      .insert({
        player_id: playerId,
        stage_id: stageId,
        status: 'in_progress',
      })
      .select('game_id,status,started_at')
      .single();

    if (gameError) {
      return jsonError('CREATE_GAME_FAILED', gameError.message, 500);
    }

    const initial = body.initialPosition ?? {};
    const sideToMove = initial.sideToMove === 'enemy' ? 'enemy' : 'player';
    const turnNumber = Number.isInteger(initial.turnNumber) && (initial.turnNumber ?? 0) >= 1 ? initial.turnNumber : 1;
    const moveCount = Number.isInteger(initial.moveCount) && (initial.moveCount ?? 0) >= 0 ? initial.moveCount : 0;

    const { error: posError } = await supabaseAdmin
      .schema('game')
      .from('positions')
      .insert({
        game_id: gameRow.game_id,
        board_state: initial.boardState ?? {},
        hands: initial.hands ?? {},
        side_to_move: sideToMove,
        turn_number: turnNumber,
        move_count: moveCount,
        sfen: initial.sfen ?? null,
        state_hash: initial.stateHash ?? null,
      });

    if (posError) {
      return jsonError('CREATE_POSITION_FAILED', posError.message, 500);
    }

    return jsonOk({
      gameId: gameRow.game_id,
      status: gameRow.status,
      startedAt: gameRow.started_at,
    });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to create game', 500);
  }
}

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
