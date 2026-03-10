import type { AiMoveRequest } from '@/lib/ai-engine-contract';

export class AiMoveRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiMoveRequestValidationError';
  }
}

export function parseAiMoveRequest(input: unknown): AiMoveRequest {
  if (!isRecord(input)) {
    throw new AiMoveRequestValidationError('body must be an object');
  }

  const gameId = asString(input.gameId, 'gameId');
  const moveNo = asInt(input.moveNo, 'moveNo', 1, 1_000_000);

  if (!isRecord(input.position)) {
    throw new AiMoveRequestValidationError('position is missing');
  }
  const positionObj = input.position;

  const sideToMove = asEnum(positionObj.sideToMove, 'sideToMove', ['player', 'enemy']);
  const turnNumber = asInt(positionObj.turnNumber, 'turnNumber', 1, 1_000_000);
  const moveCount = asInt(positionObj.moveCount, 'moveCount', 0, 1_000_000);

  const boardState = isRecord(positionObj.boardState) ? positionObj.boardState : {};
  const hands = isRecord(positionObj.hands) ? positionObj.hands : {};
  const sfen = asNullableString(positionObj.sfen);
  const stateHash = asNullableString(positionObj.stateHash);

  if (!Array.isArray(positionObj.legalMoves)) {
    throw new AiMoveRequestValidationError('legalMoves must be an array');
  }

  const legalMoves = positionObj.legalMoves.map((item, index) => {
    if (!isRecord(item)) {
      throw new AiMoveRequestValidationError(`legalMoves[${index}] must be an object`);
    }

    return {
      fromRow: asNullableInt(item.fromRow, `legalMoves[${index}].fromRow`, 0, 8),
      fromCol: asNullableInt(item.fromCol, `legalMoves[${index}].fromCol`, 0, 8),
      toRow: asInt(item.toRow, `legalMoves[${index}].toRow`, 0, 8),
      toCol: asInt(item.toCol, `legalMoves[${index}].toCol`, 0, 8),
      pieceCode: asString(item.pieceCode, `legalMoves[${index}].pieceCode`),
      promote: typeof item.promote === 'boolean' ? item.promote : false,
      dropPieceCode: asNullableString(item.dropPieceCode),
      capturedPieceCode: asNullableString(item.capturedPieceCode),
      notation: asNullableString(item.notation),
    };
  });

  return {
    gameId,
    moveNo,
    position: {
      sideToMove,
      turnNumber,
      moveCount,
      sfen,
      stateHash,
      boardState,
      hands,
      legalMoves,
    },
    engineConfig: isRecord(input.engineConfig)
      ? (input.engineConfig as AiMoveRequest['engineConfig'])
      : undefined,
  };
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AiMoveRequestValidationError(`${name} must be non-empty string`);
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new AiMoveRequestValidationError('nullable string expected');
  }
  return value;
}

function asInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AiMoveRequestValidationError(`${name} must be integer in ${min}..${max}`);
  }
  return value;
}

function asNullableInt(value: unknown, name: string, min: number, max: number): number | null {
  if (value == null) return null;
  return asInt(value, name, min, max);
}

function asEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AiMoveRequestValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
