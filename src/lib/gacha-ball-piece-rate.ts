/** ガチャ玉の色（白・青・赤・金・黒）に対応する当たり駒ウェイト倍率 — app.shogi と同値 */
export const GACHA_BALL_COLOR_KEYS = ['white', 'blue', 'red', 'gold', 'black'] as const;

export type GachaBallColorKey = (typeof GACHA_BALL_COLOR_KEYS)[number];

export const GACHA_BALL_PIECE_RATE_MULTIPLIERS: Record<GachaBallColorKey, number> = {
  white: 1,
  blue: 1.05,
  red: 1.1,
  gold: 1.2,
  black: 1.5,
};

export function isGachaCurrencyChar(char: string): boolean {
  return char === '歩' || char === '金';
}

export function normalizeGachaBallColorIndex(index: number | undefined | null): number {
  if (typeof index !== 'number' || !Number.isFinite(index)) return 0;
  const rounded = Math.floor(index);
  if (rounded < 0 || rounded >= GACHA_BALL_COLOR_KEYS.length) return 0;
  return rounded;
}

export function pieceRateMultiplierForColorIndex(colorIndex: number): number {
  const key = GACHA_BALL_COLOR_KEYS[normalizeGachaBallColorIndex(colorIndex)];
  return GACHA_BALL_PIECE_RATE_MULTIPLIERS[key];
}

export function effectiveGachaPieceWeight(
  char: string,
  baseWeight: number,
  colorIndex: number,
): number {
  const weight = Math.max(0, baseWeight);
  if (isGachaCurrencyChar(char)) return weight;
  return weight * pieceRateMultiplierForColorIndex(colorIndex);
}
