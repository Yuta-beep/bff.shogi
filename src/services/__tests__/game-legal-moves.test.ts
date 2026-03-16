import { describe, expect, it } from 'bun:test';

import { createLoadGameLegalMoves } from '@/services/game-legal-moves';

describe('loadGameLegalMoves', () => {
  it('loads current position, enriches it, and returns backend legal moves', async () => {
    const loadGameLegalMoves = createLoadGameLegalMoves({
      loadGameState: async () => ({
        gameId: 'game-1',
        position: {
          sideToMove: 'player',
          turnNumber: 3,
          moveCount: 2,
          sfen: '4k4/9/9/9/4P4/9/9/9/4K4 b - 3',
          stateHash: 'hash-1',
          boardState: { skill_state: { movement_modifiers: [] } },
          hands: { player: { FU: 1 }, enemy: {} },
        },
        game: {
          status: 'in_progress',
          result: null,
          winnerSide: null,
        },
      }),
      enrichPosition: async (_gameId, position, moveNo) => ({
        ...position,
        moveCount: moveNo - 1,
        legalMoves: [],
      }),
      requestLegalMoves: async () => ({
        legalMoves: [
          {
            fromRow: 4,
            fromCol: 4,
            toRow: 3,
            toCol: 4,
            pieceCode: 'FU',
            promote: false,
            dropPieceCode: null,
            capturedPieceCode: null,
            notation: null,
          },
          {
            fromRow: null,
            fromCol: null,
            toRow: 5,
            toCol: 4,
            pieceCode: 'FU',
            promote: false,
            dropPieceCode: 'FU',
            capturedPieceCode: null,
            notation: null,
          },
        ],
      }),
    });

    const result = await loadGameLegalMoves({ gameId: 'game-1' });

    expect(result.sideToMove).toBe('player');
    expect(result.moveNo).toBe(3);
    expect(result.stateHash).toBe('hash-1');
    expect(result.legalMoves.length).toBe(2);
    expect(result.legalMoves[1]?.dropPieceCode).toBe('FU');
  });
});
