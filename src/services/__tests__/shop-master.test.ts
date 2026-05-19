import { describe, expect, it } from 'bun:test';

import { SHOP_ITEM_PIECE_CODE, SHOP_MASTER_DEFS } from '../shop-master';

describe('shop-master', () => {
  it('maps each shop item key to a stable piece_code', () => {
    for (const def of SHOP_MASTER_DEFS) {
      expect(SHOP_ITEM_PIECE_CODE[def.kanji]).toBe(def.pieceCode);
    }
    expect(Object.keys(SHOP_ITEM_PIECE_CODE)).toHaveLength(6);
  });

  it('uses a unique display_char for shop P piece', () => {
    const shopP = SHOP_MASTER_DEFS.find((def) => def.kanji === 'P');
    expect(shopP?.displayChar).toBe('SHOP_P');
  });
});
