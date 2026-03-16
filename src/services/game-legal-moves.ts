import { requestLegalMoves } from '@/lib/ai-engine-client';
import type {
  AiMove,
  AiPosition,
  CanonicalPosition,
  LegalMovesResponse,
} from '@/lib/ai-engine-contract';
import { enrichPosition, loadGameState } from '@/services/game-move';

type LoadGameLegalMovesInput = {
  gameId: string;
};

type LoadGameLegalMovesResult = {
  sideToMove: CanonicalPosition['sideToMove'];
  moveNo: number;
  stateHash: string | null;
  legalMoves: AiMove[];
};

type LoadGameLegalMovesDeps = {
  loadGameState: typeof loadGameState;
  enrichPosition: (
    gameId: string,
    position: CanonicalPosition,
    moveNo: number,
  ) => Promise<AiPosition>;
  requestLegalMoves: (input: { position: AiPosition }) => Promise<LegalMovesResponse>;
};

export class LoadGameLegalMovesError extends Error {
  readonly code: 'GAME_NOT_FOUND' | 'INVALID_POSITION';

  constructor(code: 'GAME_NOT_FOUND' | 'INVALID_POSITION', message: string) {
    super(message);
    this.name = 'LoadGameLegalMovesError';
    this.code = code;
  }
}

export function createLoadGameLegalMoves(
  deps: LoadGameLegalMovesDeps = {
    loadGameState,
    enrichPosition,
    requestLegalMoves,
  },
) {
  return async function loadGameLegalMoves(
    input: LoadGameLegalMovesInput,
  ): Promise<LoadGameLegalMovesResult> {
    const gameState = await deps.loadGameState(input.gameId);
    const moveNo = gameState.position.moveCount + 1;
    const currentPosition = await deps.enrichPosition(input.gameId, gameState.position, moveNo);
    const response = await deps.requestLegalMoves({ position: currentPosition });

    return {
      sideToMove: gameState.position.sideToMove,
      moveNo,
      stateHash: gameState.position.stateHash ?? null,
      legalMoves: response.legalMoves,
    };
  };
}

export const loadGameLegalMoves = createLoadGameLegalMoves();
