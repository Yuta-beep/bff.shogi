import { describe, expect, it } from 'bun:test';

import { createPostStageClear } from '../stages/clear';
import { InsufficientStaminaError } from '@/services/stage-clear-reward';
import { readJson } from './test-utils';

describe('POST /api/v1/stages/:stageNo/clear', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createPostStageClear({
      resolveUserId: async () => null,
      grantStageClearRewards: async () => ({}),
    });

    const response = await handler('1', new Request('http://localhost/api/v1/stages/1/clear'));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when stageNo is invalid', async () => {
    const handler = createPostStageClear({
      resolveUserId: async () => 'user-1',
      grantStageClearRewards: async () => ({}),
    });

    const response = await handler('abc', new Request('http://localhost/api/v1/stages/abc/clear'));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_STAGE_NO');
  });

  it('returns 422 when stamina is insufficient', async () => {
    const handler = createPostStageClear({
      resolveUserId: async () => 'user-1',
      grantStageClearRewards: async () => {
        throw new InsufficientStaminaError(2, 5);
      },
    });

    const response = await handler('1', new Request('http://localhost/api/v1/stages/1/clear'));
    const payload = await readJson(response);

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('INSUFFICIENT_STAMINA');
  });

  it('returns 200 with reward payload on success', async () => {
    const handler = createPostStageClear({
      resolveUserId: async () => 'user-1',
      grantStageClearRewards: async () => ({
        stageNo: 2,
        firstClear: true,
        clearCount: 1,
        granted: {
          pawn: 12,
          gold: 2,
          pieces: [{ pieceId: 100, char: '忍', name: '忍', quantity: 1 }],
        },
        wallet: {
          pawnCurrency: 12,
          goldCurrency: 2,
        },
      }),
    });

    const response = await handler('2', new Request('http://localhost/api/v1/stages/2/clear'));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.firstClear).toBe(true);
    expect(payload.data.granted.pawn).toBe(12);
  });
});
