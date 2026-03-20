import { describe, expect, it } from 'bun:test';
import { PieceMappingNotFoundError, PieceMappingService } from '@/services/piece-mapping';

// ── ヘルパー: テスト用インメモリマッピング ──────────────────────────────────
function buildTestService(): PieceMappingService {
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
      pieceId: 2,
      sfenCode: 'L',
      displayChar: 'KY',
      canonicalCode: 'lance',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 3,
      sfenCode: 'N',
      displayChar: 'KE',
      canonicalCode: 'knight',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 4,
      sfenCode: 'S',
      displayChar: 'GI',
      canonicalCode: 'silver',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 5,
      sfenCode: 'G',
      displayChar: 'KI',
      canonicalCode: 'gold',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 6,
      sfenCode: 'B',
      displayChar: 'KA',
      canonicalCode: 'bishop',
      isSpecial: false,
      isPromoted: false,
    },
    {
      pieceId: 7,
      sfenCode: 'R',
      displayChar: 'HI',
      canonicalCode: 'rook',
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
    // 成り駒
    {
      pieceId: 9,
      sfenCode: '+P',
      displayChar: 'TO',
      canonicalCode: 'prom_pawn',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 10,
      sfenCode: '+L',
      displayChar: 'NY',
      canonicalCode: 'prom_lance',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 11,
      sfenCode: '+N',
      displayChar: 'NK',
      canonicalCode: 'prom_knight',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 12,
      sfenCode: '+S',
      displayChar: 'NG',
      canonicalCode: 'prom_silver',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 13,
      sfenCode: '+B',
      displayChar: 'UM',
      canonicalCode: 'prom_bishop',
      isSpecial: false,
      isPromoted: true,
    },
    {
      pieceId: 14,
      sfenCode: '+R',
      displayChar: 'RY',
      canonicalCode: 'prom_rook',
      isSpecial: false,
      isPromoted: true,
    },
    // 特殊駒の例
    {
      pieceId: 101,
      sfenCode: 'F',
      displayChar: 'RYU',
      canonicalCode: 'small_dragon',
      isSpecial: true,
      isPromoted: false,
    },
    {
      pieceId: 102,
      sfenCode: 'E',
      displayChar: 'HOU',
      canonicalCode: 'cannon',
      isSpecial: true,
      isPromoted: false,
    },
  ]);
}

// ── sfenCharToDisplayChar ────────────────────────────────────────────────────

describe('PieceMappingService.sfenCharToDisplayChar', () => {
  it('P (大文字) を FU に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('P', false)).toBe('FU');
  });

  it('p (小文字) も FU に変換する（大文字正規化）', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('p', false)).toBe('FU');
  });

  it('R を HI に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('R', false)).toBe('HI');
  });

  it('K を OU に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('K', false)).toBe('OU');
  });

  it('成りフラグ=true の P を TO に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('P', true)).toBe('TO');
  });

  it('成りフラグ=true の B を UM に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('B', true)).toBe('UM');
  });

  it('成りフラグ=true の R を RY に変換する', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('R', true)).toBe('RY');
  });

  it('未登録の文字は null を返す', () => {
    const svc = buildTestService();
    expect(svc.sfenCharToDisplayChar('X', false)).toBe(null);
  });
});

// ── displayCharToPieceId ─────────────────────────────────────────────────────

describe('PieceMappingService.displayCharToPieceId', () => {
  it('FU を piece_id=1 に変換する', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('FU')).toBe(1);
  });

  it('fu (小文字) も piece_id=1 に変換する（大文字正規化）', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('fu')).toBe(1);
  });

  it('OU を piece_id=8 に変換する', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('OU')).toBe(8);
  });

  it('TO（成り歩）を piece_id=9 に変換する', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('TO')).toBe(9);
  });

  it('特殊駒のローマ字 display_char も変換できる', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('RYU')).toBe(101);
  });

  it('特殊駒も独自SFENコードを返せる', () => {
    const svc = buildTestService();
    expect(svc.displayCharToSfen('HOU')).toBe('E');
  });

  it('成り駒は標準SFEN token を返す', () => {
    const svc = buildTestService();
    expect(svc.displayCharToSfen('TO')).toBe('+P');
  });

  it('未登録の display_char は null を返す', () => {
    const svc = buildTestService();
    expect(svc.displayCharToPieceId('UNKNOWN')).toBe(null);
  });
});

// ── resolveDisplayCharsToPieceIds ─────────────────────────────────────────────

describe('PieceMappingService.resolveDisplayCharsToPieceIds', () => {
  it('複数の display_char を一括で piece_id に変換する', () => {
    const svc = buildTestService();
    const result = svc.resolveDisplayCharsToPieceIds(new Set(['FU', 'HI', 'OU']));
    expect(result.get('FU')).toBe(1);
    expect(result.get('HI')).toBe(7);
    expect(result.get('OU')).toBe(8);
  });

  it('未登録のコードはマップから除外する（silent fallback 禁止: マップに含まれない）', () => {
    const svc = buildTestService();
    const result = svc.resolveDisplayCharsToPieceIds(new Set(['FU', 'UNKNOWN']));
    expect(result.has('FU')).toBe(true);
    expect(result.has('UNKNOWN')).toBe(false);
  });

  it('空 Set に対して空 Map を返す', () => {
    const svc = buildTestService();
    const result = svc.resolveDisplayCharsToPieceIds(new Set());
    expect(result.size).toBe(0);
  });
});

// ── requireDisplayChar (エラー版) ─────────────────────────────────────────────

describe('PieceMappingService.requireDisplayChar', () => {
  it('未登録の sfen_code で PieceMappingNotFoundError を投げる', () => {
    const svc = buildTestService();
    let thrown: unknown = null;
    try {
      svc.requireDisplayChar('X', false);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof PieceMappingNotFoundError).toBe(true);
  });

  it('エラーメッセージに未登録コードが含まれる', () => {
    const svc = buildTestService();
    let message = '';
    try {
      svc.requireDisplayChar('X', false);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("'X'");
  });
});

// ── extractDisplayCharsFromSfen (置換対象: sfenCharToPieceCode) ────────────────

describe('PieceMappingService.extractDisplayCharsFromSfen', () => {
  it('標準初形 SFEN から FU, HI, KA, OU を抽出する', () => {
    const svc = buildTestService();
    const codes = svc.extractDisplayCharsFromSfen(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    );
    expect(codes.has('FU')).toBe(true);
    expect(codes.has('HI')).toBe(true);
    expect(codes.has('KA')).toBe(true);
    expect(codes.has('OU')).toBe(true);
  });

  it('成り駒 (+P) を TO に変換する', () => {
    const svc = buildTestService();
    const codes = svc.extractDisplayCharsFromSfen('9/9/9/9/4+P4/9/9/9/4K4 b - 1');
    expect(codes.has('TO')).toBe(true);
    expect(codes.has('FU')).toBe(false);
  });

  it('null を渡すと空 Set を返す', () => {
    const svc = buildTestService();
    expect(svc.extractDisplayCharsFromSfen(null).size).toBe(0);
  });

  it('特殊駒の独自SFENも抽出できる', () => {
    const svc = buildTestService();
    const codes = svc.extractDisplayCharsFromSfen('9/9/9/9/4E4/9/9/9/4K4 b - 1');
    expect(codes.has('HOU')).toBe(true);
    expect(codes.has('OU')).toBe(true);
  });

  it('複数文字の拡張SFEN token も抽出できる', () => {
    const svc = PieceMappingService.fromStatic([
      {
        pieceId: 1,
        sfenCode: 'ZAA',
        displayChar: 'PC001',
        canonicalCode: 'piece_auto_1',
        isSpecial: true,
        isPromoted: false,
      },
      {
        pieceId: 2,
        sfenCode: 'K',
        displayChar: 'OU',
        canonicalCode: 'king',
        isSpecial: false,
        isPromoted: false,
      },
    ]);
    const codes = svc.extractDisplayCharsFromSfen('9/9/9/9/3ZAA5/9/9/9/4K4 b - 1');
    expect(codes.has('PC001')).toBe(true);
    expect(codes.has('OU')).toBe(true);
  });
});

// ── PieceMappingNotFoundError ─────────────────────────────────────────────────

describe('PieceMappingNotFoundError', () => {
  it('name が PieceMappingNotFoundError になる', () => {
    const err = new PieceMappingNotFoundError('FU');
    expect(err.name).toBe('PieceMappingNotFoundError');
  });

  it('Error を継承する', () => {
    const err = new PieceMappingNotFoundError('FU');
    expect(err instanceof Error).toBe(true);
  });
});
