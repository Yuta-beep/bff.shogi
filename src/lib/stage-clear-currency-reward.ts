/** ステージ初回クリア時の歩・金通貨報酬（全ステージ共通）。 */
export const STAGE_FIRST_CLEAR_PAWN_REWARD = 20;
export const STAGE_FIRST_CLEAR_GOLD_REWARD = 1;

/** 2回目以降クリア時の歩通貨: floor(stageNo / 5) + 2 */
export function repeatClearPawnReward(stageNo: number): number {
  if (!Number.isInteger(stageNo) || stageNo <= 0) return 0;
  return Math.floor(stageNo / 5) + 2;
}

export function computeStageClearCurrencyGrant(
  stageNo: number,
  firstClear: boolean,
): { pawn: number; gold: number } {
  if (firstClear) {
    return {
      pawn: STAGE_FIRST_CLEAR_PAWN_REWARD,
      gold: STAGE_FIRST_CLEAR_GOLD_REWARD,
    };
  }
  return {
    pawn: repeatClearPawnReward(stageNo),
    gold: 0,
  };
}
