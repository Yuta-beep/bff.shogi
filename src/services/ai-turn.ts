import type { AiTurnResult, EngineConfig } from '@/lib/ai-engine-contract';
import { normalizeEngineConfig } from '@/lib/engine-config';
import { requestAiMove } from '@/lib/ai-engine-client';
import {
  commitGameMove,
  loadGameState,
  enrichPosition,
  CommitGameMoveError,
} from '@/services/game-move';

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

  const currentPosition = await enrichPosition(input.gameId, gameState.position, moveNo);
  const normalizedConfig = normalizeEngineConfig(input.engineConfig);
  const aiRequest = {
    gameId: input.gameId,
    moveNo,
    position: currentPosition,
    engineConfig: normalizedConfig,
  };
  const response = await requestAiMove(aiRequest);
  const committed = await commitGameMove({
    gameId: input.gameId,
    moveNo,
    actorSide: currentPosition.sideToMove,
    move: response.selectedMove,
    thoughtMs: response.meta.thinkMs,
    currentPosition,
    aiInference: {
      normalizedConfig,
      requestPayload: aiRequest,
      responsePayload: response,
    },
  });

  return {
    selectedMove: response.selectedMove,
    skillTriggered: committed.skillTriggered,
    meta: response.meta,
    position: committed.position,
    game: committed.game,
  };
}
