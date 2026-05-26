import { describe, expect, it } from 'bun:test';

import { createGetMeSnapshot } from '../me/snapshot';
import { postMePvpRatingApply } from '../me/pvp-rating-apply';
import { postInternalPvpRatingApply } from '../internal/pvp-rating-apply';
import { readJson } from './test-utils';

describe('POST /api/v1/me/pvp-rating/apply', () => {
  it('returns 401 without auth', async () => {
    const response = await postMePvpRatingApply(
      new Request('http://localhost/api/v1/me/pvp-rating/apply', {
        method: 'POST',
        body: JSON.stringify({ matchId: 'match-1', won: true }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/internal/pvp-rating/apply', () => {
  it('returns 401 without internal token', async () => {
    const response = await postInternalPvpRatingApply(
      new Request('http://localhost/api/v1/internal/pvp-rating/apply', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u1', matchId: 'm1', won: true }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/me/snapshot rating default', () => {
  it('exposes rating from player profile', async () => {
    const handler = createGetMeSnapshot({
      resolveUserId: async () => 'user-1',
      getPlayerSnapshot: async () => ({
        displayName: 'テスト',
        rating: 0,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 50,
        maxStamina: 50,
        nextRecoveryAt: null,
      }),
    });
    const response = await handler(new Request('http://localhost/api/v1/me/snapshot'));
    const payload = await readJson(response);
    expect(payload).toEqual({
      ok: true,
      data: {
        playerName: 'テスト',
        rating: 0,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 50,
        maxStamina: 50,
        nextRecoveryAt: null,
      },
    });
  });
});
