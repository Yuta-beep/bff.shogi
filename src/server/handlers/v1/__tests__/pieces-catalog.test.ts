import { describe, expect, it } from 'bun:test';

import { createGetPieceCatalog } from '../pieces/catalog';
import { readJson } from './test-utils';

describe('GET /api/v1/pieces/catalog', () => {
  it('returns { ok, data: { items } } contract', async () => {
    const handler = createGetPieceCatalog({
      listPieceCatalog: async () => [{ pieceId: 1, pieceCode: 'FU', name: '歩' } as any],
    });
    const response = await handler();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        items: [{ pieceId: 1, pieceCode: 'FU', name: '歩' }],
      },
    });
  });
});
