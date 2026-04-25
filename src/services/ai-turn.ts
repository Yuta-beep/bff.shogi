import type { AiMove, AiTurnResult, EngineConfig } from '@/lib/ai-engine-contract';
import { normalizeEngineConfig } from '@/lib/engine-config';
import { requestAiMove, requestLegalMoves } from '@/lib/ai-engine-client';
import { AiEngineHttpError } from '@/lib/ai-engine-errors';
import {
  commitGameMove,
  loadGameState,
  enrichPosition,
  markGameFinished,
  CommitGameMoveError,
} from '@/services/game-move';
import { PieceMappingService } from '@/services/piece-mapping';

type Cell = { row: number; col: number };

export type ExecuteAiTurnInput = {
  gameId: string;
  moveNo?: number;
  engineConfig?: EngineConfig;
};

export async function executeAiTurn(input: ExecuteAiTurnInput): Promise<AiTurnResult> {
  const gameState = await loadGameState(input.gameId);
  if (gameState.game.status !== 'in_progress') {
    throw new CommitGameMoveError('GAME_ALREADY_FINISHED', 'game is already finished');
  }

  const moveNo = gameState.position.moveCount + 1;
  if (input.moveNo != null && input.moveNo !== moveNo) {
    throw new CommitGameMoveError(
      'MOVE_NO_MISMATCH',
      `expected moveNo ${moveNo} but got ${input.moveNo}`,
    );
  }

  const mappingService = await PieceMappingService.fromDb();
  const currentPosition = await enrichPosition(
    input.gameId,
    gameState.position,
    moveNo,
    mappingService,
  );
  const normalizedConfig = normalizeEngineConfig(input.engineConfig);
  const aiRequest = {
    gameId: input.gameId,
    moveNo,
    position: currentPosition,
    engineConfig: normalizedConfig,
  };
  const response = await requestAiMove(aiRequest);
  const legalForCurrent = await requestLegalMoves({ position: currentPosition });
  const alliedCells = alliedCellsFromBoardState(currentPosition.boardState, currentPosition.sideToMove);
  const sanitizedLegal = legalForCurrent.legalMoves.filter(
    (move) => !isMoveIntoAlliedCell(move, alliedCells),
  );

  if (response.isCheckmate) {
    // 相手に合法手なし = 詰み = 現在の手番側が負け = 逆側が勝ち
    const winnerSide = currentPosition.sideToMove === 'enemy' ? 'player' : 'enemy';
    const result = winnerSide === 'player' ? 'player_win' : 'enemy_win';
    await markGameFinished(input.gameId, result, winnerSide);
    return {
      selectedMove: null,
      skillTriggered: false,
      meta: null,
      position: gameState.position,
      game: { status: 'finished', result, winnerSide },
    };
  }

  let committed;
  let selectedMove = response.selectedMove;
  if (!containsSameMove(sanitizedLegal, selectedMove)) {
    selectedMove = sanitizedLegal[0] ?? legalForCurrent.legalMoves[0] ?? selectedMove;
  }
  try {
    committed = await commitGameMove({
      gameId: input.gameId,
      moveNo,
      actorSide: currentPosition.sideToMove,
      move: selectedMove,
      thoughtMs: response.meta.thinkMs,
      currentPosition,
      aiInference: {
        normalizedConfig,
        requestPayload: aiRequest,
        responsePayload: response,
      },
    });
  } catch (error: unknown) {
    const illegalApply =
      error instanceof AiEngineHttpError &&
      error.status >= 400 &&
      error.status < 500 &&
      /ILLEGAL_MOVE|selected move is not legal for current position/i.test(error.body ?? '');
    if (!illegalApply) {
      throw error;
    }

    const legal = await requestLegalMoves({ position: currentPosition });
    const alliedCells = alliedCellsFromBoardState(currentPosition.boardState, currentPosition.sideToMove);
    const fallbackMove =
      legal.legalMoves.find((move) => !isMoveIntoAlliedCell(move, alliedCells)) ??
      legal.legalMoves[0] ??
      null;
    if (!fallbackMove) {
      throw error;
    }

    selectedMove = fallbackMove;
    committed = await commitGameMove({
      gameId: input.gameId,
      moveNo,
      actorSide: currentPosition.sideToMove,
      move: selectedMove,
      thoughtMs: response.meta.thinkMs,
      currentPosition,
      aiInference: {
        normalizedConfig,
        requestPayload: aiRequest,
        responsePayload: {
          ...response,
          selectedMove,
        },
      },
    });
  }

  return {
    selectedMove,
    skillTriggered: committed.skillTriggered,
    meta: response.meta,
    position: committed.position,
    game: committed.game,
  };
}

function containsSameMove(list: AiMove[], target: AiMove): boolean {
  return list.some((mv) => sameMove(mv, target));
}

function sameMove(lhs: AiMove, rhs: AiMove): boolean {
  return (
    lhs.fromRow === rhs.fromRow &&
    lhs.fromCol === rhs.fromCol &&
    lhs.toRow === rhs.toRow &&
    lhs.toCol === rhs.toCol &&
    String(lhs.pieceCode).toUpperCase() === String(rhs.pieceCode).toUpperCase() &&
    lhs.promote === rhs.promote &&
    (lhs.dropPieceCode ?? null) === (rhs.dropPieceCode ?? null)
  );
}

function alliedCellsFromBoardState(
  boardState: Record<string, unknown>,
  side: 'player' | 'enemy',
): Cell[] {
  const rawList =
    (Array.isArray((boardState as any).pieces) && (boardState as any).pieces) ||
    (Array.isArray((boardState as any).placements) && (boardState as any).placements) ||
    (Array.isArray((boardState as any).boardPieces) && (boardState as any).boardPieces) ||
    (Array.isArray((boardState as any).board_pieces) && (boardState as any).board_pieces) ||
    [];
  const out: Cell[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const nested =
      entry.piece && typeof entry.piece === 'object'
        ? (entry.piece as Record<string, unknown>)
        : entry;
    const pieceSide = String(entry.side ?? nested.side ?? 'player');
    if (pieceSide !== side) continue;
    const row = Number(entry.row);
    const col = Number(entry.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    if (row < 0 || row > 8 || col < 0 || col > 8) continue;
    out.push({ row, col });
  }
  return out;
}

function isMoveIntoAlliedCell(move: AiMove, alliedCells: Cell[]): boolean {
  const targetHit = alliedCells.some((c) => c.row === move.toRow && c.col === move.toCol);
  if (!targetHit) return false;
  if (move.fromRow != null && move.fromCol != null) {
    return !(move.fromRow === move.toRow && move.fromCol === move.toCol);
  }
  return true;
}
