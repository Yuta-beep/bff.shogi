import { describe, expect, it } from 'bun:test';

import { createGetPieceCatalog } from '../pieces/catalog';
import { readJson } from './test-utils';

describe('GET /api/v1/pieces/catalog', () => {
  it('returns { ok, data: { items } } contract', async () => {
    const handler = createGetPieceCatalog({
      listPieceCatalog: async () =>
        [
          {
            pieceId: 1,
            pieceCode: 'FU',
            moveCode: 'pawn',
            name: '歩',
            move: '前方に1マス移動できる。',
            moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
            isRepeatable: false,
            canJump: false,
            moveConstraints: null,
            moveRules: [],
          },
        ] as any,
    });
    const response = await handler();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        items: [
          {
            pieceId: 1,
            pieceCode: 'FU',
            moveCode: 'pawn',
            name: '歩',
            move: '前方に1マス移動できる。',
            moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
            isRepeatable: false,
            canJump: false,
            moveConstraints: null,
            moveRules: [],
          },
        ],
      },
    });
  });
});
