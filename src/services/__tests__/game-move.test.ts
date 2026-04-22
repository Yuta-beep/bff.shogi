import { describe, expect, it } from 'bun:test';

import { createCommitGameMove, CommitGameMoveError } from '@/services/game-move';
import { PieceMappingService } from '@/services/piece-mapping';

function buildMappingService(): PieceMappingService {
  return PieceMappingService.fromStatic([
    {
      pieceId: 1,
      sfenCode: 'P',
      displayChar: 'FU',
      canonicalCode: 'pawn',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 8,
      sfenCode: 'K',
      displayChar: 'OU',
      canonicalCode: 'king',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 9,
      sfenCode: '+P',
      displayChar: 'TO',
      canonicalCode: 'prom_pawn',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 201,
      sfenCode: 'ZAA',
      displayChar: 'COPPER',
      canonicalCode: 'copper',
      isSpecial: true,
      isPromoted: false,
    },
    {
      pieceId: 202,
      sfenCode: 'ZAE',
      displayChar: 'IRON',
      canonicalCode: 'iron',
      isSpecial: true,
      isPromoted: false,
    },
    {
      pieceId: 203,
      sfenCode: 'ZAB',
      displayChar: 'LEAD',
      canonicalCode: 'lead',
      isSpecial: true,
      isPromoted: false,
    },
    {
      pieceId: 204,
      sfenCode: 'ZAC',
      displayChar: 'TIN',
      canonicalCode: 'tin',
      isSpecial: true,
      isPromoted: false,
    },
    {
      pieceId: 205,
      sfenCode: 'ZAH',
      displayChar: 'WIND',
      canonicalCode: 'wind',
      isSpecial: true,
      isPromoted: false,
    },
  ]);
}

describe('commitGameMove', () => {
  it('commits a move using canonical next position from the apply service', async () => {
    const persistCalls: unknown[] = [];
    const insertInferenceCalls: unknown[] = [];
    const commitGameMove = createCommitGameMove({
      mappingService: buildMappingService(),
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
      mappingService: buildMappingService(),
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

  it('keeps captured mineral hands on actor side only', async () => {
    const commitGameMove = createCommitGameMove({
      mappingService: buildMappingService(),
      loadGameState: async () => ({
        gameId: 'game-mineral',
        position: {
          sideToMove: 'player',
          turnNumber: 7,
          moveCount: 6,
          sfen: '4k4/9/9/9/9/9/9/9/4K4 b - 7',
          stateHash: null,
          boardState: {},
          hands: { player: {}, enemy: {} },
        },
        game: { status: 'in_progress', result: null, winnerSide: null },
      }),
      enrichPosition: async (_gameId, position) => ({ ...position, legalMoves: [] }),
      applyMove: async () => ({
        sideToMove: 'enemy',
        turnNumber: 8,
        moveCount: 7,
        sfen: '4k4/9/9/9/9/9/9/9/4K4 w A 8',
        stateHash: null,
        boardState: {},
        hands: { player: { COPPER: 1 }, enemy: { COPPER: 1 } },
      }),
      persistMove: async () => {},
      insertInferenceLog: async () => {},
    });

    const result = await commitGameMove({
      gameId: 'game-mineral',
      moveNo: 7,
      actorSide: 'player',
      move: {
        fromRow: 4,
        fromCol: 4,
        toRow: 3,
        toCol: 4,
        pieceCode: 'FU',
        promote: false,
        dropPieceCode: null,
        capturedPieceCode: 'COPPER',
        notation: null,
      },
    });

    expect(result.position.hands).toEqual({
      player: { COPPER: 1 },
      enemy: {},
    });
  });

  it('consumes dropped piece from actor even when side_to_move does not flip', async () => {
    const commitGameMove = createCommitGameMove({
      mappingService: buildMappingService(),
      loadGameState: async () => ({
        gameId: 'game-extra-turn',
        position: {
          sideToMove: 'enemy',
          turnNumber: 10,
          moveCount: 9,
          sfen: '4k4/9/9/9/9/9/9/9/4K4 w z 10',
          stateHash: null,
          boardState: {},
          hands: { player: {}, enemy: { TIN: 1 } },
        },
        game: { status: 'in_progress', result: null, winnerSide: null },
      }),
      enrichPosition: async (_gameId, position) => ({ ...position, legalMoves: [] }),
      applyMove: async () => ({
        // 追加行動スキル等で手番が維持されたケースを模擬
        sideToMove: 'enemy',
        turnNumber: 11,
        moveCount: 10,
        sfen: '4k4/9/9/9/4z4/9/9/9/4K4 w z 11',
        stateHash: null,
        boardState: {},
        hands: { player: {}, enemy: { TIN: 1 } },
      }),
      persistMove: async () => {},
      insertInferenceLog: async () => {},
    });

    const result = await commitGameMove({
      gameId: 'game-extra-turn',
      moveNo: 10,
      actorSide: 'enemy',
      move: {
        fromRow: null,
        fromCol: null,
        toRow: 4,
        toCol: 4,
        pieceCode: 'TIN',
        promote: false,
        dropPieceCode: 'TIN',
        capturedPieceCode: null,
        notation: null,
      },
    });

    expect(result.position.hands).toEqual({
      player: {},
      enemy: {},
    });
  });

  it('reconciles captured symbol-piece ownership for enemy token pairs', async () => {
    const commitGameMove = createCommitGameMove({
      mappingService: buildMappingService(),
      loadGameState: async () => ({
        gameId: 'game-wind-capture',
        position: {
          sideToMove: 'player',
          turnNumber: 15,
          moveCount: 14,
          sfen: '4k4/9/9/9/9/9/9/9/4K4 b - 15',
          stateHash: null,
          boardState: {},
          hands: { player: {}, enemy: {} },
        },
        game: { status: 'in_progress', result: null, winnerSide: null },
      }),
      enrichPosition: async (_gameId, position) => ({ ...position, legalMoves: [] }),
      applyMove: async () => ({
        sideToMove: 'enemy',
        turnNumber: 16,
        moveCount: 15,
        // enemy 側 token は '>'。捕獲補正でこれを減算できることを検証する。
        sfen: '4k4/9/9/9/9/9/9/9/4K4 w > 16',
        stateHash: null,
        boardState: {},
        hands: { player: { WIND: 1 }, enemy: { WIND: 1 } },
      }),
      persistMove: async () => {},
      insertInferenceLog: async () => {},
    });

    const result = await commitGameMove({
      gameId: 'game-wind-capture',
      moveNo: 15,
      actorSide: 'player',
      move: {
        fromRow: 4,
        fromCol: 4,
        toRow: 3,
        toCol: 4,
        pieceCode: 'FU',
        promote: false,
        dropPieceCode: null,
        capturedPieceCode: 'WIND',
        notation: null,
      },
    });

    expect(result.position.hands).toEqual({
      player: { WIND: 1 },
      enemy: {},
    });
  });
});
