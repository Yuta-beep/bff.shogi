/**
 * `true` のとき `master.m_stage.stamina_cost` を無視する。
 * 入室時のスタミナ消費を行わず、ステージ一覧の `staminaCost` も常に 0 を返す。
 * DB マイグレーション未適用でも無料入室できるようにする。
 * マスタ値に戻す場合は `false` に変更する。
 */
export const STAGE_STAMINA_IGNORE_MASTER = true;

export function effectiveStageStaminaCost(masterStaminaCost: number | null | undefined): number {
  if (STAGE_STAMINA_IGNORE_MASTER) return 0;
  return Number(masterStaminaCost ?? 0);
}
