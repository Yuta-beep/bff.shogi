import { supabaseAdmin } from '@/lib/supabase-admin';

// ── エラー型 ─────────────────────────────────────────────────────────────────

export class PieceMappingNotFoundError extends Error {
  constructor(identifier: string) {
    super(`piece_mapping に '${identifier}' のエントリが存在しません`);
    this.name = 'PieceMappingNotFoundError';
  }
}

// ── マッピングエントリ ─────────────────────────────────────────────────────────

export type PieceMappingEntry = {
  pieceId: number;
  sfenCode: string | null; // m_piece_mapping.sfen_code。拡張SFEN token。例: P, +P, C, ZAA
  displayChar: string; // ゲームロジックで使う表示コード (FU/KY/KE/GI/KI/KA/HI/OU/NIN/...)
  canonicalCode: string; // 正規名 (pawn/lance/.../small_dragon etc.)
  isSpecial: boolean;
  isPromoted: boolean;
};

type PieceMappingRow = {
  piece_id: number;
  sfen_code: string | null;
  display_char: string;
  canonical_piece_code: string;
  is_special: boolean;
  is_promoted: boolean;
};

// ── モジュールレベルキャッシュ ─────────────────────────────────────────────────

let _moduleCache: PieceMappingService | null = null;

export function resetPieceMappingCacheForTests(): void {
  _moduleCache = null;
}

// ── PieceMappingService ───────────────────────────────────────────────────────

export class PieceMappingService {
  // key: sfen token uppercased → displayChar
  private readonly sfenTokenToDisplay: Map<string, string>;
  // key: displayChar.toUpperCase() → pieceId
  private readonly displayToPieceId: Map<string, number>;
  // key: displayChar.toUpperCase() → entry
  private readonly displayToEntry: Map<string, PieceMappingEntry>;
  // key: displayChar.toUpperCase() → SFEN token
  private readonly displayToSfen: Map<string, string>;
  private readonly sfenTokensByLengthDesc: string[];

  private constructor(entries: readonly PieceMappingEntry[]) {
    this.sfenTokenToDisplay = new Map();
    this.displayToPieceId = new Map();
    this.displayToEntry = new Map();
    this.displayToSfen = new Map();

    for (const entry of entries) {
      if (entry.sfenCode) {
        const token = entry.sfenCode.toUpperCase();
        this.sfenTokenToDisplay.set(token, entry.displayChar);
        this.displayToSfen.set(entry.displayChar.toUpperCase(), token);
      }
      const upper = entry.displayChar.toUpperCase();
      this.displayToPieceId.set(upper, entry.pieceId);
      this.displayToEntry.set(upper, entry);
    }

    this.sfenTokensByLengthDesc = [...this.sfenTokenToDisplay.keys()].sort(
      (left, right) => right.length - left.length || left.localeCompare(right),
    );
  }

  // ── ファクトリ: テスト用インメモリ ──────────────────────────────────────────

  static fromStatic(entries: readonly PieceMappingEntry[]): PieceMappingService {
    return new PieceMappingService(entries);
  }

  // ── ファクトリ: DB ──────────────────────────────────────────────────────────

  static async fromDb(): Promise<PieceMappingService> {
    if (_moduleCache) return _moduleCache;

    const { data, error } = await supabaseAdmin
      .schema('master')
      .from('m_piece_mapping')
      .select('piece_id,sfen_code,display_char,canonical_piece_code,is_special,is_promoted')
      .eq('is_active', true);

    if (error) throw error;

    const entries: PieceMappingEntry[] = ((data ?? []) as PieceMappingRow[]).map((row) => ({
      pieceId: row.piece_id,
      sfenCode: row.sfen_code ?? null,
      displayChar: row.display_char,
      canonicalCode: row.canonical_piece_code,
      isSpecial: row.is_special,
      isPromoted: row.is_promoted,
    }));

    _moduleCache = new PieceMappingService(entries);
    return _moduleCache;
  }

  // ── SFEN文字 → displayChar ─────────────────────────────────────────────────

  /**
   * SFEN の1文字から game-logic で使う display_char を返す。
   * 未登録の場合は null。
   */
  sfenCharToDisplayChar(sfenChar: string, isPromoted = false): string | null {
    const normalized = sfenChar.toUpperCase();
    const token = isPromoted ? `+${normalized}` : normalized;
    return this.sfenTokenToDisplayChar(token);
  }

  sfenTokenToDisplayChar(sfenToken: string): string | null {
    return this.sfenTokenToDisplay.get(sfenToken.toUpperCase()) ?? null;
  }

  /**
   * sfenCharToDisplayChar の厳密版。未登録の場合は PieceMappingNotFoundError を投げる。
   */
  requireDisplayChar(sfenChar: string, isPromoted = false): string {
    const result = this.sfenCharToDisplayChar(sfenChar, isPromoted);
    if (result === null) {
      throw new PieceMappingNotFoundError(`sfen:'${sfenChar}' promoted:${isPromoted}`);
    }
    return result;
  }

  // ── displayChar → pieceId ─────────────────────────────────────────────────

  /**
   * game-logic の display_char から m_piece.piece_id を返す。
   * 未登録の場合は null。
   */
  displayCharToPieceId(displayChar: string): number | null {
    return this.displayToPieceId.get(displayChar.toUpperCase()) ?? null;
  }

  displayCharToSfen(displayChar: string): string | null {
    return this.displayToSfen.get(displayChar.toUpperCase()) ?? null;
  }

  /**
   * 複数の display_char を一括で Map<displayChar, pieceId> に変換する。
   * 未登録のコードはマップから除外する（silent fallback 禁止: 呼び出し側が判断）。
   */
  resolveDisplayCharsToPieceIds(displayChars: Set<string>): Map<string, number> {
    const result = new Map<string, number>();
    for (const code of displayChars) {
      const pieceId = this.displayCharToPieceId(code);
      if (pieceId !== null) {
        result.set(code, pieceId);
      }
    }
    return result;
  }

  // ── SFEN文字列から display_chars を抽出 ───────────────────────────────────

  /**
   * SFEN 盤面文字列から全ての display_char を抽出する。
   * ハードコードの sfenCharToPieceCode() の置換。
   * 未登録文字はスキップする。
   */
  extractDisplayCharsFromSfen(sfen: string | null): Set<string> {
    const out = new Set<string>();
    if (!sfen) return out;

    const board = sfen.split(' ')[0] ?? '';
    let index = 0;

    while (index < board.length) {
      const current = board[index] ?? '';
      if (current === '/' || (current >= '1' && current <= '9')) {
        index += 1;
        continue;
      }
      const matched = this.matchSfenToken(board, index);
      if (!matched) {
        index += 1;
        continue;
      }
      out.add(matched.displayChar);
      index += matched.length;
    }

    return out;
  }

  displayCharAtSquare(sfen: string | null, row: number, col: number): string | null {
    if (!sfen || row < 0 || row > 8 || col < 0 || col > 8) return null;
    const board = sfen.split(' ')[0] ?? '';
    const ranks = board.split('/');
    if (ranks.length !== 9) return null;

    const rank = ranks[row] ?? '';
    let file = 0;
    let index = 0;

    while (index < rank.length) {
      const current = rank[index] ?? '';
      if (current >= '1' && current <= '9') {
        file += Number(current);
        index += 1;
        continue;
      }
      const matched = this.matchSfenToken(rank, index);
      if (!matched) {
        index += 1;
        continue;
      }
      if (file === col) return matched.displayChar;
      file += 1;
      index += matched.length;
    }

    return null;
  }

  hasRawSfenToken(sfen: string | null, targetToken: string): boolean {
    if (!sfen) return false;
    const board = sfen.split(' ')[0] ?? '';
    const normalizedTarget = targetToken.toUpperCase();
    let index = 0;

    while (index < board.length) {
      const current = board[index] ?? '';
      if (current === '/' || (current >= '1' && current <= '9')) {
        index += 1;
        continue;
      }
      const matched = this.matchSfenToken(board, index);
      if (!matched) {
        index += 1;
        continue;
      }
      if (matched.rawToken.toUpperCase() === normalizedTarget) return true;
      index += matched.length;
    }

    return false;
  }

  private matchSfenToken(
    source: string,
    startIndex: number,
  ): { rawToken: string; displayChar: string; length: number } | null {
    for (const token of this.sfenTokensByLengthDesc) {
      const rawToken = source.slice(startIndex, startIndex + token.length);
      if (rawToken.length !== token.length) continue;
      if (rawToken.toUpperCase() !== token) continue;
      const displayChar = this.sfenTokenToDisplay.get(token);
      if (!displayChar) continue;
      return { rawToken, displayChar, length: token.length };
    }
    return null;
  }
}

// ── 後方互換ラッパー (移行期間中のみ使用、最終的に削除する) ─────────────────────

/**
 * @deprecated PieceMappingService.extractDisplayCharsFromSfen() を使うこと。
 * この関数はハードコード変換の移行完了後に削除する。
 */
export async function sfenCharToDisplayCharViaDb(
  ch: string,
  isPromoted = false,
): Promise<string | null> {
  const svc = await PieceMappingService.fromDb();
  return svc.sfenCharToDisplayChar(ch, isPromoted);
}
