import {
  computeStageClearCurrencyGrant,
  repeatClearPawnReward,
} from '@/lib/stage-clear-currency-reward';

describe('stage-clear-currency-reward', () => {
  it('初回クリアは歩20・金1', () => {
    expect(computeStageClearCurrencyGrant(1, true)).toEqual({ pawn: 20, gold: 1 });
    expect(computeStageClearCurrencyGrant(99, true)).toEqual({ pawn: 20, gold: 1 });
  });

  it('2回目以降は歩のみ floor(stageNo/5)+2', () => {
    expect(repeatClearPawnReward(1)).toBe(2);
    expect(repeatClearPawnReward(4)).toBe(2);
    expect(repeatClearPawnReward(5)).toBe(3);
    expect(repeatClearPawnReward(10)).toBe(4);
    expect(repeatClearPawnReward(25)).toBe(7);
    expect(computeStageClearCurrencyGrant(10, false)).toEqual({ pawn: 4, gold: 0 });
  });
});
