import { describe, expect, it } from 'bun:test';

import { AiEngineConnectionError, AiEngineHttpError } from '@/lib/ai-engine-errors';
import { AiMoveRequestValidationError } from '@/lib/ai-move-request-parser';
import { createPostAiMove } from '../ai/move';
import { invalidJsonRequest, jsonRequest, readJson } from './test-utils';

describe('POST /api/v1/ai/move', () => {
  it('returns 400 for invalid JSON', async () => {
    const handler = createPostAiMove({
      parseAiMoveRequest: () => ({}) as any,
      executeAiTurn: async () => ({}) as any,
    });
    const response = await handler(invalidJsonRequest('http://localhost/api/v1/ai/move'));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_JSON');
  });

  it('returns 200 with fixed envelope on success', async () => {
    const handler = createPostAiMove({
      parseAiMoveRequest: (body) => body as any,
      executeAiTurn: async () =>
        ({
          selectedMove: { pieceCode: 'FU', fromRow: 6, fromCol: 4, toRow: 5, toCol: 4 },
          meta: {
            engineVersion: 'test',
            thinkMs: 10,
            searchedNodes: 20,
            searchDepth: 2,
            evalCp: 30,
            candidateCount: 2,
            configApplied: {},
          },
          position: {
            sideToMove: 'player',
            turnNumber: 2,
            moveCount: 1,
            sfen: 'x',
            stateHash: null,
            boardState: {},
            hands: {},
          },
          game: { status: 'in_progress', result: null, winnerSide: null },
        }) as any,
    });
    const response = await handler(
      jsonRequest('http://localhost/api/v1/ai/move', { gameId: 'g', moveNo: 1 }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        selectedMove: { pieceCode: 'FU', fromRow: 6, fromCol: 4, toRow: 5, toCol: 4 },
        meta: {
          engineVersion: 'test',
          thinkMs: 10,
          searchedNodes: 20,
          searchDepth: 2,
          evalCp: 30,
          candidateCount: 2,
          configApplied: {},
        },
        position: {
          sideToMove: 'player',
          turnNumber: 2,
          moveCount: 1,
          sfen: 'x',
          stateHash: null,
          boardState: {},
          hands: {},
        },
        game: {
          status: 'in_progress',
          result: null,
          winnerSide: null,
        },
      },
    });
  });

  it('maps validation and upstream errors deterministically', async () => {
    const validation = createPostAiMove({
      parseAiMoveRequest: () => {
        throw new AiMoveRequestValidationError('bad request');
      },
      executeAiTurn: async () => ({}) as any,
    });
    const vRes = await validation(jsonRequest('http://localhost/api/v1/ai/move', { a: 1 }));
    const vPayload = await readJson(vRes);
    expect(vRes.status).toBe(400);
    expect(vPayload.error.code).toBe('INVALID_REQUEST');

    const badRequest = createPostAiMove({
      parseAiMoveRequest: (body) => body as any,
      executeAiTurn: async () => {
        throw new AiEngineHttpError(422, 'invalid payload');
      },
    });
    const bRes = await badRequest(jsonRequest('http://localhost/api/v1/ai/move', { a: 1 }));
    const bPayload = await readJson(bRes);
    expect(bRes.status).toBe(422);
    expect(bPayload.error.code).toBe('AI_ENGINE_BAD_REQUEST');

    const unreachable = createPostAiMove({
      parseAiMoveRequest: (body) => body as any,
      executeAiTurn: async () => {
        throw new AiEngineConnectionError('connect ECONNREFUSED');
      },
    });
    const uRes = await unreachable(jsonRequest('http://localhost/api/v1/ai/move', { a: 1 }));
    const uPayload = await readJson(uRes);
    expect(uRes.status).toBe(502);
    expect(uPayload.error.code).toBe('AI_ENGINE_UNREACHABLE');
  });
});
