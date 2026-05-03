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
    out.push({ side, row, col, char, pieceCode });
  }
  return out;
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
    const legalMoves = mergeHouseSkillOnlyLegalMoves(response.legalMoves, gameState.position);

    return {
      sideToMove: gameState.position.sideToMove,
      moveNo,
      stateHash: gameState.position.stateHash ?? null,
      legalMoves,
    };
  };
}

export const loadGameLegalMoves = createLoadGameLegalMoves();
