import { describe, expect, it } from 'bun:test';

import { createCommitGameMove, CommitGameMoveError } from '@/services/game-move';

describe('commitGameMove', () => {
  it('commits a move using canonical next position from the apply service', async () => {
    const persistCalls: unknown[] = [];
    const insertInferenceCalls: unknown[] = [];
    const commitGameMove = createCommitGameMove({
      loadGameState: async () => ({
        gameId: 'game-1',
        position: {
          sideToMove: 'player',
          turnNumber: 1,
          moveCount: 0,
          sfen: '4k4/9/9/9/4P4/9/9/9/4K4 b - 1',
          stateHash: null,
          boardState: {},
          hands: { player: {}, enemy: {} },
        },
        game: {
          status: 'in_progress',
          result: null,
          winnerSide: null,
        },
      }),
      enrichPosition: async (_gameId, position) => ({
        ...position,
        legalMoves: [],
      }),
      applyMove: async () => ({
        sideToMove: 'enemy',
        turnNumber: 2,
        moveCount: 1,
        sfen: '4k4/9/9/4P4/9/9/9/9/4K4 w - 2',
        stateHash: null,
        boardState: { skill_state: { piece_statuses: [] } },
        hands: { player: {}, enemy: {} },
      }),
      persistMove: async (input) => {
        persistCalls.push(input);
      },
      insertInferenceLog: async (input) => {
        insertInferenceCalls.push(input);
      },
    });

    const result = await commitGameMove({
      gameId: 'game-1',
      moveNo: 1,
      actorSide: 'player',
      move: {
        fromRow: 4,
        fromCol: 4,
        toRow: 3,
        toCol: 4,
        pieceCode: 'FU',
        promote: false,
        dropPieceCode: null,
        capturedPieceCode: null,
        notation: '7f7e',
      },
    });

    expect(result.position.sfen).toBe('4k4/9/9/4P4/9/9/9/9/4K4 w - 2');
    expect(result.game.status).toBe('in_progress');
    expect(persistCalls.length).toBe(1);
    expect(insertInferenceCalls.length).toBe(0);
  });

  it('rejects moveNo mismatches before applying', async () => {
    const commitGameMove = createCommitGameMove({
      loadGameState: async () => ({
        gameId: 'game-1',
        position: {
          sideToMove: 'player',
          turnNumber: 1,
          moveCount: 2,
          sfen: '4k4/9/9/9/9/9/9/9/4K4 b - 3',
          stateHash: null,
          boardState: {},
          hands: { player: {}, enemy: {} },
        },
        game: {
          status: 'in_progress',
          result: null,
          winnerSide: null,
        },
      }),
      enrichPosition: async () => {
        throw new Error('should not be called');
      },
      applyMove: async () => {
        throw new Error('should not be called');
      },
      persistMove: async () => {
        throw new Error('should not be called');
      },
      insertInferenceLog: async () => {
        throw new Error('should not be called');
      },
    });

    let thrown: unknown = null;
    try {
      await commitGameMove({
        gameId: 'game-1',
        moveNo: 2,
        actorSide: 'player',
        move: {
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
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown instanceof CommitGameMoveError).toBe(true);
  });
});
