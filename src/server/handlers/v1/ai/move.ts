import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { requestAiMove } from '@/lib/ai-engine-client';
import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { normalizeEngineConfig } from '@/lib/engine-config';
import { persistAiTurn } from '@/services/game-runtime';

export function optionsAiMove() {
  return optionsResponse();
}

export async function postAiMove(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  try {
    const input = parseRequest(body);
    const normalizedConfig = normalizeEngineConfig(input.engineConfig);

    const result = await requestAiMove({
      ...input,
      engineConfig: normalizedConfig,
    });

    await persistAiTurn({
      request: input,
      normalizedConfig,
      response: result,
    });

    return jsonOk(result);
  } catch (error: any) {
    const message = error?.message ?? 'Failed to get AI move';

    console.error('[api/v1/ai/move]', {
      message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });

    if (
      message.startsWith('INVALID_REQUEST:') ||
      message.includes('must be') ||
      message.includes('missing')
    ) {
      return jsonError('INVALID_ENGINE_CONFIG', message, 400);
    }

    if (message.startsWith('GAME_NOT_FOUND:')) {
      return jsonError('GAME_NOT_FOUND', message, 404);
    }

    const aiHttpMatch = message.match(/^AI_ENGINE_HTTP_(\d+):\s*([\s\S]*)$/);
    if (aiHttpMatch) {
      const upstreamStatus = Number(aiHttpMatch[1]);
      const upstreamMessage = aiHttpMatch[2]?.trim() || 'AI engine returned an error';
      if (upstreamStatus >= 400 && upstreamStatus < 500) {
        return jsonError('AI_ENGINE_BAD_REQUEST', upstreamMessage, upstreamStatus);
      }
      return jsonError('AI_ENGINE_UPSTREAM', upstreamMessage, 502);
    }

    if (
      message.includes('fetch failed') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND')
    ) {
      return jsonError('AI_ENGINE_UNREACHABLE', message, 502);
    }

    return jsonError('ENGINE_INTERNAL', message, 500);
  }
}

function parseRequest(input: unknown): AiMoveRequest {
  if (!isRecord(input)) {
    throw new Error('INVALID_REQUEST: body must be an object');
  }

  const gameId = asString(input.gameId, 'gameId');
  const moveNo = asInt(input.moveNo, 'moveNo', 1, 1_000_000);

  if (!isRecord(input.position)) {
    throw new Error('INVALID_REQUEST: position is missing');
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
    throw new Error('INVALID_REQUEST: legalMoves must be an array');
  }

  const legalMoves = positionObj.legalMoves.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`INVALID_REQUEST: legalMoves[${index}] must be an object`);
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
    engineConfig: isRecord(input.engineConfig) ? (input.engineConfig as AiMoveRequest['engineConfig']) : undefined,
  };
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`INVALID_REQUEST: ${name} must be non-empty string`);
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('INVALID_REQUEST: nullable string expected');
  return value;
}

function asInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`INVALID_REQUEST: ${name} must be integer in ${min}..${max}`);
  }
  return value;
}

function asNullableInt(value: unknown, name: string, min: number, max: number): number | null {
  if (value == null) return null;
  return asInt(value, name, min, max);
}

function asEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`INVALID_REQUEST: ${name} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
