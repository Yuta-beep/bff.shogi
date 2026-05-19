import { describe, expect, it } from 'bun:test';

import { sortOwnedPiecesForDeckBuilder } from '../deck';

describe('sortOwnedPiecesForDeckBuilder', () => {
  it('orders shop-owned pieces before others', () => {
    const sorted = sortOwnedPiecesForDeckBuilder([
      {
        pieceId: 1,
        char: '香',
        name: '香',
        quantity: 1,
        acquiredAt: '2020-01-01T00:00:00.000Z',
        source: 'initial',
      },
      {
        pieceId: 2,
        char: '走',
        name: '走',
        quantity: 1,
        acquiredAt: '2026-01-02T00:00:00.000Z',
        source: 'shop',
      },
    ]);

    expect(sorted.map((piece) => piece.char)).toEqual(['走', '香']);
  });
});
