import { describe, expect, it } from 'bun:test';
import {
  collectPieceCodesForSkillLookup,
  extractPieceCodesFromSfen,
} from '@/services/ai-skill-effects';

describe('ai skill effects helpers', () => {
  it('extracts piece codes from SFEN board', () => {
    const codes = extractPieceCodesFromSfen(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    );
    expect(codes.has('FU')).toBe(true);
    expect(codes.has('HI')).toBe(true);
    expect(codes.has('KA')).toBe(true);
    expect(codes.has('OU')).toBe(true);
  });

  it('collects piece codes from both SFEN and legal moves', () => {
    const codes = collectPieceCodesForSkillLookup({
      sideToMove: 'enemy',
      turnNumber: 1,
      moveCount: 0,
      sfen: '9/9/9/9/9/9/9/9/4K4 b - 1',
      stateHash: null,
      boardState: {},
      hands: {},
      legalMoves: [
        {
          fromRow: 6,
          fromCol: 4,
          toRow: 5,
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
          toRow: 4,
          toCol: 4,
          pieceCode: 'FU',
          promote: false,
          dropPieceCode: 'GI',
          capturedPieceCode: null,
          notation: null,
        },
      ],
    });
    expect(codes.has('FU')).toBe(true);
    expect(codes.has('GI')).toBe(true);
    expect(codes.has('OU')).toBe(true);
  });
});
