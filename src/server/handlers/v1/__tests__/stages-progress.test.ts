import { describe, expect, it } from 'bun:test';

import { createGetStageProgress } from '../stages/progress';
import { readJson } from './test-utils';

describe('GET /api/v1/stages/progress', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createGetStageProgress({
      resolveUserId: async () => null,
      listClearedStageNos: async () => [],
    });
    const response = await handler(new Request('http://localhost/api/v1/stages/progress'));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns cleared stage numbers', async () => {
    const handler = createGetStageProgress({
      resolveUserId: async () => 'user-1',
      listClearedStageNos: async () => [1, 2, 5],
    });
    const response = await handler(new Request('http://localhost/api/v1/stages/progress'));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { clearedStageNos: [1, 2, 5] },
    });
  });
});
