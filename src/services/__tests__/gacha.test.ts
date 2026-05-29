import { describe, expect, it } from 'bun:test';

import { computeOutcomeRatesFromWeights, pickWeightedRandom } from '@/services/gacha';

describe('gacha weighted pool', () => {
  it('computeOutcomeRatesFromWeights matches hihen HTML weights', () => {
    const rates = computeOutcomeRatesFromWeights([
      { char: '歩', rarity: 'N', weight: 45 },
      { char: '金', rarity: 'N', weight: 25 },
      { char: '灯', rarity: 'R', weight: 15 },
      { char: '煽', rarity: 'SR', weight: 10 },
      { char: '爆', rarity: 'UR', weight: 5 },
    ]);
    expect(rates.N).toBeCloseTo(0.7, 4);
    expect(rates.R).toBeCloseTo(0.15, 4);
    expect(rates.SR).toBeCloseTo(0.1, 4);
    expect(rates.UR).toBeCloseTo(0.05, 4);
  });

  it('pickWeightedRandom respects dominant weight over many trials', () => {
    const items = [
      { id: 'pawn', weight: 90 },
      { id: 'rare', weight: 10 },
    ];
    let pawnHits = 0;
    for (let i = 0; i < 500; i += 1) {
      const picked = pickWeightedRandom(items, (x) => x.weight);
      if (picked.id === 'pawn') pawnHits += 1;
    }
    expect(pawnHits).toBeGreaterThan(400);
  });
});
