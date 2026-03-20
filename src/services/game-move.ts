import { applyAiMove } from '@/lib/ai-engine-client';
import type {
  AiMove,
  AiMoveMeta,
  AiMoveRequest,
  AiPosition,
  CanonicalPosition,
  CommittedMoveResponse,
  GameStatusSnapshot,
} from '@/lib/ai-engine-contract';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { NormalizedEngineConfig } from '@/lib/engine-config';
import { attachSkillEffectsToAiRequest } from '@/services/ai-skill-effects';
import { PieceMappingService } from '@/services/piece-mapping';

type PersistedPositionRow = {
  game_id: string;
  board_state: Record<string, unknown>;
  hands: Record<string, unknown>;
  side_to_move: 'player' | 'enemy';
  turn_number: number;
  move_count: number;
  sfen: string | null;
  state_hash: string | null;
};

type PersistedGameRow = {
  game_id: string;
  status: GameStatusSnapshot['status'];
  result: GameStatusSnapshot['result'];
  winner_side: GameStatusSnapshot['winnerSide'];
};

type LoadedGameState = {
  gameId: string;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
};

type CommitGameMoveInput = {
  gameId: string;
  moveNo: number;
  actorSide: 'player' | 'enemy';
  clientMoveId?: string | null;
  move: AiMove;
  stateHash?: string | null;
  thoughtMs?: number | null;
  currentPosition?: AiPosition;
  aiInference?: {
    normalizedConfig: NormalizedEngineConfig;
    requestPayload: AiMoveRequest;
    responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
  };
};

type CommitGameMoveDeps = {
  loadGameState: (gameId: string) => Promise<LoadedGameState>;
  enrichPosition: (
    gameId: string,
    position: CanonicalPosition,
    moveNo: number,
    mappingService: PieceMappingService,
  ) => Promise<AiPosition>;
  applyMove: (input: { position: AiPosition; selectedMove: AiMove }) => Promise<CanonicalPosition>;
  persistMove: (input: {
    gameId: string;
    moveNo: number;
    actorSide: 'player' | 'enemy';
    move: AiMove;
    thoughtMs?: number | null;
    position: CanonicalPosition;
    game: GameStatusSnapshot;
  }) => Promise<void>;
  insertInferenceLog: (input: {
    gameId: string;
    moveNo: number;
    normalizedConfig: NormalizedEngineConfig;
    requestPayload: AiMoveRequest;
    responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
  }) => Promise<void>;
  mappingService?: PieceMappingService;
};

export class CommitGameMoveError extends Error {
  readonly code:
    | 'GAME_NOT_FOUND'
    | 'GAME_ALREADY_FINISHED'
    | 'TURN_MISMATCH'
    | 'MOVE_NO_MISMATCH'
    | 'STALE_POSITION'
    | 'INVALID_POSITION';

  constructor(
    code:
      | 'GAME_NOT_FOUND'
      | 'GAME_ALREADY_FINISHED'
      | 'TURN_MISMATCH'
      | 'MOVE_NO_MISMATCH'
      | 'STALE_POSITION'
      | 'INVALID_POSITION',
    message: string,
  ) {
    super(message);
    this.name = 'CommitGameMoveError';
    this.code = code;
  }
}

export function createCommitGameMove(
  deps: CommitGameMoveDeps = {
    loadGameState,
    enrichPosition,
    applyMove: applyCanonicalMove,
    persistMove,
    insertInferenceLog,
  },
) {
  return async function commitGameMove(input: CommitGameMoveInput): Promise<CommittedMoveResponse> {
    const totalStart = Date.now();
    const metrics: Record<string, number> = {};

    const loadStart = Date.now();
    const gameState = await deps.loadGameState(input.gameId);
    metrics.loadGameStateMs = Date.now() - loadStart;
    if (gameState.game.status !== 'in_progress') {
      throw new CommitGameMoveError('GAME_ALREADY_FINISHED', 'game is already finished');
    }

    const expectedMoveNo = gameState.position.moveCount + 1;
    if (input.moveNo !== expectedMoveNo) {
      throw new CommitGameMoveError(
        'MOVE_NO_MISMATCH',
        `expected moveNo ${expectedMoveNo} but got ${input.moveNo}`,
      );
    }
    if (input.actorSide !== gameState.position.sideToMove) {
      throw new CommitGameMoveError(
        'TURN_MISMATCH',
        `expected actorSide ${gameState.position.sideToMove} but got ${input.actorSide}`,
      );
    }
    if (
      input.stateHash &&
      gameState.position.stateHash &&
      input.stateHash !== gameState.position.stateHash
    ) {
      throw new CommitGameMoveError('STALE_POSITION', 'stateHash does not match current position');
    }

    const mappingService = deps.mappingService ?? (await PieceMappingService.fromDb());
    const enrichStart = Date.now();
    const currentPosition =
      input.currentPosition ??
      (await deps.enrichPosition(input.gameId, gameState.position, expectedMoveNo, mappingService));
    metrics.enrichPositionMs = Date.now() - enrichStart;
    const normalizedMove = withCapturedPieceCode(currentPosition, input.move, mappingService);

    const applyStart = Date.now();
    const nextPosition = await deps.applyMove({
      position: currentPosition,
      selectedMove: normalizedMove,
    });
    metrics.applyMoveMs = Date.now() - applyStart;
    const nextGame = deriveGameStatus(nextPosition, mappingService);

    const persistStart = Date.now();
    await deps.persistMove({
      gameId: input.gameId,
      moveNo: expectedMoveNo,
      actorSide: input.actorSide,
      move: normalizedMove,
      thoughtMs: input.thoughtMs ?? null,
      position: nextPosition,
      game: nextGame,
    });
    metrics.persistMoveMs = Date.now() - persistStart;

    if (input.aiInference) {
      const inferenceLogStart = Date.now();
      await deps.insertInferenceLog({
        gameId: input.gameId,
        moveNo: expectedMoveNo,
        normalizedConfig: input.aiInference.normalizedConfig,
        requestPayload: input.aiInference.requestPayload,
        responsePayload: input.aiInference.responsePayload,
      });
      metrics.insertInferenceLogMs = Date.now() - inferenceLogStart;
    }

    const serverAppliedAt = new Date().toISOString();
    metrics.totalMs = Date.now() - totalStart;
    console.info(
      JSON.stringify({
        event: 'commit_game_move_timing',
        gameId: input.gameId,
        moveNo: expectedMoveNo,
        actorSide: input.actorSide,
        clientMoveId: input.clientMoveId ?? null,
        promote: Boolean(input.move.promote),
        ...metrics,
      }),
    );

    return {
      moveNo: expectedMoveNo,
      actorSide: input.actorSide,
      clientMoveId: input.clientMoveId ?? null,
      move: normalizedMove,
      skillTriggered: isSkillTriggeredMove(normalizedMove),
      serverAppliedAt,
      position: nextPosition,
      game: nextGame,
    };
  };
}

export const commitGameMove = createCommitGameMove();

export async function loadGameState(gameId: string): Promise<LoadedGameState> {
  const { data: positionRow, error: positionError } = await supabaseAdmin
    .schema('game')
    .from('positions')
    .select('game_id,board_state,hands,side_to_move,turn_number,move_count,sfen,state_hash')
    .eq('game_id', gameId)
    .maybeSingle<PersistedPositionRow>();
  if (positionError) throw positionError;

  const { data: gameRow, error: gameError } = await supabaseAdmin
    .schema('game')
    .from('games')
    .select('game_id,status,result,winner_side')
    .eq('game_id', gameId)
    .maybeSingle<PersistedGameRow>();
  if (gameError) throw gameError;

  if (!positionRow || !gameRow) {
    throw new CommitGameMoveError('GAME_NOT_FOUND', `game not found: ${gameId}`);
  }

  return {
    gameId,
    position: {
      sideToMove: positionRow.side_to_move,
      turnNumber: positionRow.turn_number,
      moveCount: positionRow.move_count,
      sfen: positionRow.sfen,
      stateHash: positionRow.state_hash,
      boardState: positionRow.board_state ?? {},
      hands: positionRow.hands ?? {},
    },
    game: {
      status: gameRow.status,
      result: gameRow.result,
      winnerSide: gameRow.winner_side,
    },
  };
}

export async function enrichPosition(
  gameId: string,
  position: CanonicalPosition,
  moveNo: number,
  mappingService: PieceMappingService,
): Promise<AiPosition> {
  const enriched = await attachSkillEffectsToAiRequest(
    {
      gameId,
      moveNo,
      position: {
        ...position,
        legalMoves: [],
      },
    },
    mappingService,
  );
  return enriched.position;
}

async function applyCanonicalMove(input: {
  position: AiPosition;
  selectedMove: AiMove;
}): Promise<CanonicalPosition> {
  const response = await applyAiMove(input);
  return response.position;
}

async function persistMove(input: {
  gameId: string;
  moveNo: number;
  actorSide: 'player' | 'enemy';
  move: AiMove;
  thoughtMs?: number | null;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
}) {
  const { error: moveError } = await supabaseAdmin
    .schema('game')
    .from('moves')
    .upsert(
      {
        game_id: input.gameId,
        move_no: input.moveNo,
        actor_side: input.actorSide,
        from_row: input.move.fromRow,
        from_col: input.move.fromCol,
        to_row: input.move.toRow,
        to_col: input.move.toCol,
        piece_code: input.move.pieceCode,
        promote: input.move.promote,
        drop_piece_code: input.move.dropPieceCode,
        captured_piece_code: input.move.capturedPieceCode,
        notation: input.move.notation,
        thought_ms: input.thoughtMs ?? null,
      },
      { onConflict: 'game_id,move_no' },
    );
  if (moveError) throw moveError;

  const { error: positionError } = await supabaseAdmin
    .schema('game')
    .from('positions')
    .upsert(
      {
        game_id: input.gameId,
        board_state: input.position.boardState,
        hands: input.position.hands,
        side_to_move: input.position.sideToMove,
        turn_number: input.position.turnNumber,
        move_count: input.position.moveCount,
        sfen: input.position.sfen ?? null,
        state_hash: input.position.stateHash ?? null,
      },
      { onConflict: 'game_id' },
    );
  if (positionError) throw positionError;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status: input.game.status,
    result: input.game.result,
    winner_side: input.game.winnerSide,
    ended_at: input.game.status === 'finished' ? new Date().toISOString() : null,
  };
  const { error: gameError } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update(updatePayload)
    .eq('game_id', input.gameId);
  if (gameError) throw gameError;
}

export async function markGameFinished(
  gameId: string,
  result: GameStatusSnapshot['result'],
  winnerSide: GameStatusSnapshot['winnerSide'],
): Promise<void> {
  const { error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update({
      updated_at: new Date().toISOString(),
      status: 'finished',
      result,
      winner_side: winnerSide,
      ended_at: new Date().toISOString(),
    })
    .eq('game_id', gameId);
  if (error) throw error;
}

async function insertInferenceLog(input: {
  gameId: string;
  moveNo: number;
  normalizedConfig: NormalizedEngineConfig;
  requestPayload: AiMoveRequest;
  responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
}) {
  const selectedMoveText =
    input.responsePayload.selectedMove.notation ??
    formatMoveText(input.responsePayload.selectedMove);

  const { error } = await supabaseAdmin.schema('game').from('ai_inference_logs').insert({
    game_id: input.gameId,
    move_no: input.moveNo,
    engine_version: input.responsePayload.meta.engineVersion,
    engine_config: input.normalizedConfig,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload,
    selected_move: selectedMoveText,
    eval_cp: input.responsePayload.meta.evalCp,
    searched_nodes: input.responsePayload.meta.searchedNodes,
    search_depth: input.responsePayload.meta.searchDepth,
    think_ms: input.responsePayload.meta.thinkMs,
  });
  if (error) throw error;
}

function withCapturedPieceCode(
  position: CanonicalPosition,
  move: AiMove,
  mappingService: PieceMappingService,
): AiMove {
  if (move.capturedPieceCode || move.dropPieceCode) {
    return move;
  }
  const capturedPieceCode = pieceCodeAt(
    position.sfen ?? null,
    move.toRow,
    move.toCol,
    mappingService,
  );
  return {
    ...move,
    capturedPieceCode,
  };
}

function pieceCodeAt(
  sfen: string | null,
  row: number,
  col: number,
  mappingService: PieceMappingService,
): string | null {
  return mappingService.displayCharAtSquare(sfen, row, col);
}

function deriveGameStatus(
  position: CanonicalPosition,
  mappingService: PieceMappingService,
): GameStatusSnapshot {
  const hasPlayerKing = mappingService.hasRawSfenToken(position.sfen ?? null, 'K');
  const hasEnemyKing = mappingService.hasRawSfenToken(position.sfen ?? null, 'k');

  if (!hasEnemyKing) {
    return {
      status: 'finished',
      result: 'player_win',
      winnerSide: 'player',
    };
  }
  if (!hasPlayerKing) {
    return {
      status: 'finished',
      result: 'enemy_win',
      winnerSide: 'enemy',
    };
  }
  return {
    status: 'in_progress',
    result: null,
    winnerSide: null,
  };
}

function formatMoveText(move: AiMove): string {
  const src =
    move.fromRow === null || move.fromCol === null ? 'drop' : `${move.fromRow},${move.fromCol}`;
  return `${src}->${move.toRow},${move.toCol}:${move.pieceCode}`;
}

function isSkillTriggeredMove(move: AiMove): boolean {
  const notation = move.notation;
  if (!notation) return false;
  if (/^[1-9][a-i][1-9][a-i]\+?$/i.test(notation)) return false;
  return true;
}
