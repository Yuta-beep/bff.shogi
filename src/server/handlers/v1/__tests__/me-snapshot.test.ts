import { describe, expect, it } from 'bun:test';

import { createGetMeSnapshot } from '../me/snapshot';
import { readJson } from './test-utils';

describe('GET /api/v1/me/snapshot', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createGetMeSnapshot({
      resolveUserId: async () => null,
      getPlayerSnapshot: async () => null,
    });
    const response = await handler(new Request('http://localhost/api/v1/me/snapshot'));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns db-backed snapshot with rank/exp', async () => {
    const handler = createGetMeSnapshot({
      resolveUserId: async () => 'user-1',
      getPlayerSnapshot: async () => ({
        displayName: '将棋太郎',
        rating: 1500,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 45,
        maxStamina: 50,
        nextRecoveryAt: '2026-03-20T12:10:00.000Z',
      }),
    });
    const response = await handler(new Request('http://localhost/api/v1/me/snapshot'));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        playerName: '将棋太郎',
        rating: 1500,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 45,
        maxStamina: 50,
        nextRecoveryAt: '2026-03-20T12:10:00.000Z',
      },
    });
  });
});
