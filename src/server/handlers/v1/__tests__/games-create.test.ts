import { describe, expect, it } from 'bun:test';

import { CreateGameSessionError } from '@/services/game-session';
import { createPostCreateGame } from '../games/create';
import { invalidJsonRequest, jsonRequest, readJson } from './test-utils';

describe('POST /api/v1/games', () => {
  it('returns 400 when body is invalid JSON', async () => {
    const handler = createPostCreateGame({
      resolveStageId: async () => null,
      createGameSession: async () => ({ gameId: 'x', status: 'in_progress', startedAt: 'now' }),
    });
    const response = await handler(invalidJsonRequest('http://localhost/api/v1/games'));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
    });
  });

  it('returns 200 and fixed envelope on success', async () => {
    const handler = createPostCreateGame({
      resolveStageId: async () => 10,
      createGameSession: async () => ({
        gameId: 'game-1',
        status: 'in_progress',
        startedAt: '2026-03-10T00:00:00.000Z',
      }),
    });
    const response = await handler(
      jsonRequest('http://localhost/api/v1/games', { playerId: 'u-1' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        gameId: 'game-1',
        status: 'in_progress',
        startedAt: '2026-03-10T00:00:00.000Z',
      },
    });
  });

  it('maps CreateGameSessionError to error code', async () => {
    const handler = createPostCreateGame({
      resolveStageId: async () => null,
      createGameSession: async () => {
        throw new CreateGameSessionError('CREATE_GAME_FAILED', 'db failed');
      },
    });
    const response = await handler(
      jsonRequest('http://localhost/api/v1/games', { playerId: 'u-1' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'CREATE_GAME_FAILED', message: 'db failed' },
    });
  });
});
