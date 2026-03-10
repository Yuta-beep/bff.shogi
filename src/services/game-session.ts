import { supabaseAdmin } from '@/lib/supabase-admin';

export type CreateGameSessionInput = {
  playerId: string;
  stageId: number | null;
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

export class CreateGameSessionError extends Error {
  readonly code: 'CREATE_GAME_FAILED' | 'CREATE_POSITION_FAILED';

  constructor(code: 'CREATE_GAME_FAILED' | 'CREATE_POSITION_FAILED', message: string) {
    super(message);
    this.name = 'CreateGameSessionError';
    this.code = code;
  }
}

export async function createGameSession(input: CreateGameSessionInput) {
  const { data: gameRow, error: gameError } = await supabaseAdmin
    .schema('game')
    .from('games')
    .insert({
      player_id: input.playerId,
      stage_id: input.stageId,
      status: 'in_progress',
    })
    .select('game_id,status,started_at')
    .single();

  if (gameError || !gameRow) {
    throw new CreateGameSessionError(
      'CREATE_GAME_FAILED',
      gameError?.message ?? 'failed to create game row',
    );
  }

  const initial = input.initialPosition ?? {};
  const sideToMove = initial.sideToMove === 'enemy' ? 'enemy' : 'player';
  const turnNumber =
    Number.isInteger(initial.turnNumber) && (initial.turnNumber ?? 0) >= 1 ? initial.turnNumber : 1;
  const moveCount =
    Number.isInteger(initial.moveCount) && (initial.moveCount ?? 0) >= 0 ? initial.moveCount : 0;

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
    await supabaseAdmin.schema('game').from('games').delete().eq('game_id', gameRow.game_id);
    throw new CreateGameSessionError('CREATE_POSITION_FAILED', posError.message);
  }

  return {
    gameId: gameRow.game_id as string,
    status: gameRow.status as string,
    startedAt: gameRow.started_at as string,
  };
}
