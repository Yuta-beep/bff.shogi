import { describe, expect, it } from 'bun:test';

import { getMeSnapshot } from '../me/snapshot';
import { readJson } from './test-utils';

describe('GET /api/v1/me/snapshot', () => {
  it('returns fixed mock contract', async () => {
    const response = await getMeSnapshot();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        playerName: 'プレイヤー名',
        rating: 1200,
        pawnCurrency: 0,
        goldCurrency: 0,
        note: 'TEMP_MOCK_NO_USER_TABLE',
      },
    });
  });
});
