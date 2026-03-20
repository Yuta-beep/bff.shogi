import { execSync } from 'node:child_process';
import { describe, expect, it } from 'bun:test';

import { extractPieceCodesFromSfen } from '@/services/ai-skill-effects';
import { createCommitGameMove } from '@/services/game-move';
import { PieceMappingService } from '@/services/piece-mapping';

function buildBoundaryMappingService(): PieceMappingService {
  return PieceMappingService.fromStatic([
    {
      pieceId: 101,
      sfenCode: 'P',
      displayChar: 'PX',
      canonicalCode: 'pawn_x',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 108,
      sfenCode: 'K',
      displayChar: 'KX',
      canonicalCode: 'king_x',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 109,
      sfenCode: '+P',
      displayChar: 'PT',
      canonicalCode: 'prom_pawn_x',
      isSpecial: false,
      isPromoted: true,
    },
  ]);
}

function grepOutput(command: string): string {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    if (error.status === 1) {
      return '';
    }
    throw error;
  }
}

describe('Backend dependency boundary', () => {
  it('uses PieceMappingService for SFEN and captured-piece conversion', async () => {
    const mappingService = buildBoundaryMappingService();
    const persistCalls: Array<{ move: { capturedPieceCode: string | null } }> = [];
    const commitGameMove = createCommitGameMove({
      mappingService,
      loadGameState: async () => ({
        gameId: 'game-1',
        position: {
          sideToMove: 'player',
          turnNumber: 1,
          moveCount: 0,
          sfen: '4k4/9/9/9/4+P4/9/9/9/4K4 b - 1',
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
      applyMove: async ({ position }) => position,
      persistMove: async (input) => {
        persistCalls.push({ move: { capturedPieceCode: input.move.capturedPieceCode } });
      },
      insertInferenceLog: async () => undefined,
    });

    expect(extractPieceCodesFromSfen('9/9/9/9/4+P4/9/9/9/4K4 b - 1', mappingService)).toEqual(
      new Set(['PT', 'KX']),
    );

    const result = await commitGameMove({
      gameId: 'game-1',
      moveNo: 1,
      actorSide: 'player',
      move: {
        fromRow: 5,
        fromCol: 4,
        toRow: 4,
        toCol: 4,
        pieceCode: 'PX',
        promote: false,
        dropPieceCode: null,
        capturedPieceCode: null,
        notation: null,
      },
    });

    expect(result.move.capturedPieceCode).toBe('PT');
    expect(persistCalls[0]?.move.capturedPieceCode).toBe('PT');
  });

  it('has no legacy hardcoded SFEN conversion helper in backend sources', () => {
    const output = grepOutput(
      "rg -n \"_hardcodedSfenCharToDisplayChar|switch.*piece_code|if.*piece_code.*===\" src --glob '*.ts' --glob '!**/__tests__/**'",
    );
    expect(output).toBe('');
  });
});
