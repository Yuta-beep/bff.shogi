import type { AiMove } from '@/lib/ai-engine-contract';

export type CommitMoveRequest = {
  moveNo: number;
  actorSide: 'player' | 'enemy';
  move: AiMove;
  stateHash?: string | null;
};

export class GameMoveRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameMoveRequestValidationError';
  }
}

export function parseGameMoveRequest(input: unknown): CommitMoveRequest {
  if (!isRecord(input)) {
    throw new GameMoveRequestValidationError('body must be an object');
  }

  const moveNo = asInt(input.moveNo, 'moveNo', 1, 1_000_000);
  const actorSide = asEnum(input.actorSide, 'actorSide', ['player', 'enemy']);
  const stateHash = asNullableString(input.stateHash);

  if (!isRecord(input.move)) {
    throw new GameMoveRequestValidationError('move must be an object');
  }

  return {
    moveNo,
    actorSide,
    stateHash,
    move: parseMove(input.move),
  };
}

function parseMove(input: Record<string, unknown>): AiMove {
  return {
    fromRow: asNullableInt(input.fromRow, 'move.fromRow', 0, 8),
    fromCol: asNullableInt(input.fromCol, 'move.fromCol', 0, 8),
    toRow: asInt(input.toRow, 'move.toRow', 0, 8),
    toCol: asInt(input.toCol, 'move.toCol', 0, 8),
    pieceCode: asString(input.pieceCode, 'move.pieceCode'),
    promote: typeof input.promote === 'boolean' ? input.promote : false,
    dropPieceCode: asNullableString(input.dropPieceCode) ?? null,
    capturedPieceCode: asNullableString(input.capturedPieceCode) ?? null,
    notation: asNullableString(input.notation) ?? null,
  };
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GameMoveRequestValidationError(`${name} must be non-empty string`);
  }
  return value;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new GameMoveRequestValidationError('nullable string expected');
  }
  return value;
}

function asInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new GameMoveRequestValidationError(`${name} must be integer in ${min}..${max}`);
  }
  return value;
}

function asNullableInt(value: unknown, name: string, min: number, max: number): number | null {
  if (value == null) return null;
  return asInt(value, name, min, max);
}

function asEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new GameMoveRequestValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
