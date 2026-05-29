/** ノーマルダンジョン1回のスタミナ消費 */
export const NORMAL_DUNGEON_STAMINA_COST = 5;

/**
 * `true` のとき `master.m_stage.stamina_cost` を無視する。
 * 本番は `false`（ノーマルダンジョンでスタミナ5消費）。
 */
export const STAGE_STAMINA_IGNORE_MASTER = false;

export function effectiveStageStaminaCost(
  masterStaminaCost: number | null | undefined,
  stageCategory?: string | null,
): number {
  if (STAGE_STAMINA_IGNORE_MASTER) return 0;
  const fromMaster = Number(masterStaminaCost ?? 0);
  if (fromMaster > 0) return fromMaster;
  if ((stageCategory ?? 'normal') === 'normal') return NORMAL_DUNGEON_STAMINA_COST;
  return 0;
}
