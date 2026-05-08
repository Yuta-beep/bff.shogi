import { requestLegalMoves } from '@/lib/ai-engine-client';
import type {
  AiMove,
  AiPosition,
  CanonicalPosition,
  LegalMovesResponse,
} from '@/lib/ai-engine-contract';

/** エンジンが返さない同一マス系の家スキル合法手を BFF 側で補完する（アプリの generateLegalMoves と整合） */
const KANJI_TO_CODE_FOR_HOUSE_SKILL: Readonly<Record<string, string>> = {
  家: 'HOUSE',
  民: 'PEOPLE',
};

type BoardPieceRow = {
  side: 'player' | 'enemy';
  row: number;
  col: number;
  char: string;
  pieceCode: string | null;
  kbossLivesRemaining?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function boardPiecesFromCanonicalBoardState(boardState: Record<string, unknown>): BoardPieceRow[] {
  const rawPieces = Array.isArray(boardState.pieces)
    ? boardState.pieces
    : Array.isArray(boardState.placements)
      ? boardState.placements
      : [];
  const out: BoardPieceRow[] = [];
  for (const raw of rawPieces) {
    const obj = asRecord(raw);
    if (!obj) continue;
    const side = obj.side === 'enemy' ? 'enemy' : 'player';
    const row = typeof obj.row === 'number' ? obj.row : null;
    const col = typeof obj.col === 'number' ? obj.col : null;
    if (row == null || col == null) continue;
    const rawPiece = asRecord(obj.piece);
    const fromChar = String(obj.char ?? rawPiece?.char ?? '');
    const charNorm = (() => {
      try {
        return fromChar.normalize('NFKC');
      } catch {
        return fromChar;
      }
    })();
    const rawCode =
      (typeof obj.pieceCode === 'string' ? obj.pieceCode : null) ??
      (typeof rawPiece?.code === 'string' ? (rawPiece.code as string) : null);
    const pieceCode = rawCode ? rawCode.toUpperCase() : null;
    const char = charNorm.length > 0 ? charNorm : fromChar;
    const livesRaw = obj.kbossLivesRemaining ?? rawPiece?.kbossLivesRemaining;
    const kbossLivesRemaining =
      typeof livesRaw === 'number' && Number.isFinite(livesRaw) ? livesRaw : undefined;
    out.push({ side, row, col, char, pieceCode, kbossLivesRemaining });
  }
  return out;
}

function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper.startsWith('PIECE_SHOGI_')) return upper.slice('PIECE_SHOGI_'.length);
  if (upper.startsWith('PIECE_')) return upper.slice('PIECE_'.length);
  return upper;
}

function resolveCapturedPieceCode(row: BoardPieceRow | null | undefined): string | null {
  if (!row) return null;
  if (row.char === '剣') return 'HOLY_SWORD';
  if (row.char === '刀') return 'SWORD';
  if (row.char === '盾') return 'SHIELD';
  return row.pieceCode ?? null;
}

function isGunPiece(row: BoardPieceRow): boolean {
  return row.char === '銃' || normalizeCode(row.pieceCode) === 'GUN';
}

function isKingPiece(row: BoardPieceRow): boolean {
  const c = normalizeCode(row.pieceCode);
  return row.char === '王' || row.char === '玉' || c === 'OU' || c === 'KING';
}

function isArmorPiece(row: BoardPieceRow): boolean {
  const c = normalizeCode(row.pieceCode);
  return row.char === '鎧' || c === 'ARMOR';
}

function isKbossPiece(row: BoardPieceRow): boolean {
  const c = normalizeCode(row.pieceCode);
  return row.char === 'K' || c === 'KBOSS';
}

function kbossLives(row: BoardPieceRow): number {
  const v = row.kbossLivesRemaining;
  if (v === 1 || v === 2) return v;
  return 2;
}

function buildOccupiedMap(rows: BoardPieceRow[]): Map<string, BoardPieceRow> {
  const map = new Map<string, BoardPieceRow>();
  for (const r of rows) map.set(`${r.row}:${r.col}`, r);
  return map;
}

/** ai.shogi が返さないことがある銃の前方2マス貫通手を補完する。 */
function mergeGunForwardPenetrationLegalMoves(
  legalMoves: AiMove[],
  position: CanonicalPosition,
): AiMove[] {
  const boardState = position.boardState as Record<string, unknown>;
  const rows = boardPiecesFromCanonicalBoardState(boardState);
  const occ = buildOccupiedMap(rows);
  const side = position.sideToMove;
  const forward = side === 'player' ? -1 : 1;
  const hasMove = (fromRow: number, fromCol: number, toRow: number, toCol: number) =>
    legalMoves.some(
      (m) =>
        m.fromRow === fromRow &&
        m.fromCol === fromCol &&
        m.toRow === toRow &&
        m.toCol === toCol &&
        !m.dropPieceCode,
    );

  const extras: AiMove[] = [];
  for (const p of rows) {
    if (p.side !== side || !isGunPiece(p)) continue;
    const r1 = p.row + forward;
    const r2 = p.row + 2 * forward;
    const c = p.col;
    if (r1 < 0 || r1 > 8 || r2 < 0 || r2 > 8) continue;
    if (hasMove(p.row, p.col, r2, c)) continue;

    const p1 = occ.get(`${r1}:${c}`) ?? null;
    const p2 = occ.get(`${r2}:${c}`) ?? null;

    if (p1 && p1.side === side && (isKingPiece(p1) || isArmorPiece(p1) || isKbossPiece(p1)))
      continue;
    if (p2 && p2.side === side) continue;
    if (p1 && isKingPiece(p1)) continue;
    if (p2 && isKingPiece(p2)) continue;
    if (p1 && isArmorPiece(p1)) continue;
    if (p2 && isArmorPiece(p2)) continue;
    if (p1 && isKbossPiece(p1) && kbossLives(p1) > 1) continue;

    extras.push({
      fromRow: p.row,
      fromCol: p.col,
      toRow: r2,
      toCol: c,
      pieceCode: p.pieceCode ?? 'GUN',
      promote: false,
      dropPieceCode: null,
      capturedPieceCode: p2 && p2.side !== side ? resolveCapturedPieceCode(p2) : null,
      notation: null,
    });
  }

  return extras.length === 0 ? legalMoves : [...legalMoves, ...extras];
}

function mergeHouseSkillOnlyLegalMoves(
  legalMoves: AiMove[],
  position: CanonicalPosition,
): AiMove[] {
  if (position.sideToMove !== 'player') return legalMoves;
  const boardState = position.boardState as Record<string, unknown>;
  const rows = boardPiecesFromCanonicalBoardState(boardState);
  const people = rows.filter((p) => {
    const ch = p.char;
    const pc = p.pieceCode;
    return pc === 'PEOPLE' || ch === '民' || KANJI_TO_CODE_FOR_HOUSE_SKILL[ch] === 'PEOPLE';
  }).length;
  if (people >= 5) return legalMoves;

  const hasHouseSkillAt = (r: number, c: number) =>
    legalMoves.some(
      (m) =>
        m.notation === 'house_skill_only' &&
        m.fromRow === r &&
        m.fromCol === c &&
        m.toRow === r &&
        m.toCol === c,
    );

  const extras: AiMove[] = [];
  for (const p of rows) {
    if (p.side !== 'player') continue;
    const ch = p.char;
    const pc = p.pieceCode;
    const isHouse = pc === 'HOUSE' || ch === '家' || KANJI_TO_CODE_FOR_HOUSE_SKILL[ch] === 'HOUSE';
    if (!isHouse) continue;
    if (hasHouseSkillAt(p.row, p.col)) continue;
    extras.push({
      fromRow: p.row,
      fromCol: p.col,
      toRow: p.row,
      toCol: p.col,
      pieceCode: 'HOUSE',
      promote: false,
      dropPieceCode: null,
      capturedPieceCode: null,
      notation: 'house_skill_only',
    });
  }
  return extras.length === 0 ? legalMoves : [...legalMoves, ...extras];
}
import { enrichPosition, loadGameState } from '@/services/game-move';
import { PieceMappingService } from '@/services/piece-mapping';

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
    mappingService: PieceMappingService,
  ) => Promise<AiPosition>;
  requestLegalMoves: (input: { position: AiPosition }) => Promise<LegalMovesResponse>;
  mappingService?: PieceMappingService;
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
    const mappingService = deps.mappingService ?? (await PieceMappingService.fromDb());
    const currentPosition = await deps.enrichPosition(
      input.gameId,
      gameState.position,
      moveNo,
      mappingService,
    );
    const response = await deps.requestLegalMoves({ position: currentPosition });
    const legalMovesHouseMerged = mergeHouseSkillOnlyLegalMoves(
      response.legalMoves,
      gameState.position,
    );
    const legalMoves = mergeGunForwardPenetrationLegalMoves(
      legalMovesHouseMerged,
      gameState.position,
    );

    return {
      sideToMove: gameState.position.sideToMove,
      moveNo,
      stateHash: gameState.position.stateHash ?? null,
      legalMoves,
    };
  };
}

export const loadGameLegalMoves = createLoadGameLegalMoves();
