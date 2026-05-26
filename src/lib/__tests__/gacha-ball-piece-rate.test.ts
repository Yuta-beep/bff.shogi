import { describe, expect, it } from 'bun:test';

import {
  effectiveGachaPieceWeight,
  pieceRateMultiplierForColorIndex,
} from '@/lib/gacha-ball-piece-rate';

describe('gacha-ball-piece-rate', () => {
  it('applies multipliers per color', () => {
    expect(pieceRateMultiplierForColorIndex(0)).toBe(1);
    expect(pieceRateMultiplierForColorIndex(1)).toBe(1.05);
    expect(pieceRateMultiplierForColorIndex(2)).toBe(1.1);
    expect(pieceRateMultiplierForColorIndex(3)).toBe(1.2);
    expect(pieceRateMultiplierForColorIndex(4)).toBe(1.5);
  });

  it('does not boost currency weights', () => {
    expect(effectiveGachaPieceWeight('歩', 45, 4)).toBe(45);
    expect(effectiveGachaPieceWeight('金', 25, 4)).toBe(25);
    expect(effectiveGachaPieceWeight('爆', 5, 4)).toBe(7.5);
  });
});
