import type { EngineConfig } from '@/lib/ai-engine-contract';

export type AiTurnRequest = {
  gameId: string;
  moveNo?: number;
  engineConfig?: EngineConfig;
};

export class AiMoveRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiMoveRequestValidationError';
  }
}

export function parseAiMoveRequest(input: unknown): AiTurnRequest {
  if (!isRecord(input)) {
    throw new AiMoveRequestValidationError('body must be an object');
  }

  const gameId = asString(input.gameId, 'gameId');
  const moveNo = input.moveNo == null ? undefined : asInt(input.moveNo, 'moveNo', 1, 1_000_000);

  return {
    gameId,
    moveNo,
    engineConfig: isRecord(input.engineConfig) ? (input.engineConfig as EngineConfig) : undefined,
  };
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AiMoveRequestValidationError(`${name} must be non-empty string`);
  }
  return value;
}

function asInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AiMoveRequestValidationError(`${name} must be integer in ${min}..${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
