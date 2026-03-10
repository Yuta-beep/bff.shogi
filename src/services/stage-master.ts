import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';

export type StageRow = {
  stage_id: number;
  stage_no: number;
  stage_name: string;
  unlock_stage_no: number | null;
  difficulty: number | null;
  stage_category?: string | null;
  clear_condition_type?: string | null;
  clear_condition_params?: Record<string, unknown> | null;
  recommended_power?: number | null;
  stamina_cost?: number | null;
  is_active: boolean;
  published_at: string | null;
  unpublished_at: string | null;
};

export async function listPublishedStages() {
  const { data, error } = await supabaseAdmin
    .schema('master')
    .from('m_stage')
    .select(
      'stage_id,stage_no,stage_name,unlock_stage_no,difficulty,stage_category,clear_condition_type,clear_condition_params,recommended_power,stamina_cost,is_active,published_at,unpublished_at',
    )
    .order('stage_no', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as StageRow[]).filter((row) => isPublishedNow(row));
}

export async function getStageByNo(stageNo: number) {
  const { data, error } = await supabaseAdmin
    .schema('master')
    .from('m_stage')
    .select(
      'stage_id,stage_no,stage_name,unlock_stage_no,difficulty,stage_category,clear_condition_type,clear_condition_params,recommended_power,stamina_cost,is_active,published_at,unpublished_at',
    )
    .eq('stage_no', stageNo)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as StageRow;
}

export async function getStageBattleSetup(stageId: number) {
  const toPieceRow = (row: any) => {
    if (Array.isArray(row?.m_piece)) {
      return row.m_piece[0] ?? null;
    }
    return row?.m_piece ?? null;
  };

  const placementRes = await supabaseAdmin
    .schema('master')
    .from('m_stage_initial_placement')
    .select(
      'side,row_no,col_no,piece_id,m_piece:piece_id(piece_code,kanji,name,move_pattern_id,skill_id,image_bucket,image_key)',
    )
    .eq('stage_id', stageId)
    .order('side', { ascending: true })
    .order('row_no', { ascending: true })
    .order('col_no', { ascending: true });

  if (placementRes.error) throw placementRes.error;

  const rosterRes = await supabaseAdmin
    .schema('master')
    .from('m_stage_piece')
    .select('role,weight,piece_id,m_piece:piece_id(piece_code,kanji,name)')
    .eq('stage_id', stageId)
    .order('role', { ascending: true });

  if (rosterRes.error) throw rosterRes.error;

  const rewardRes = await supabaseAdmin
    .schema('master')
    .from('m_stage_reward')
    .select(
      'reward_timing,quantity,drop_rate,sort_order,m_reward:reward_id(reward_code,reward_type,reward_name,item_code,piece_id)',
    )
    .eq('stage_id', stageId)
    .order('sort_order', { ascending: true });

  const rewards = rewardRes.error ? [] : (rewardRes.data ?? []);

  const storageUrlByAsset = new Map<string, string | null>();
  const signedUrlTtlSec = 60 * 60;

  for (const row of placementRes.data ?? []) {
    const piece = toPieceRow(row);
    const bucket = piece?.image_bucket as string | null | undefined;
    const key = piece?.image_key as string | null | undefined;
    if (!bucket || !key) continue;

    const cacheKey = `${bucket}::${key}`;
    if (storageUrlByAsset.has(cacheKey)) continue;

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(key, signedUrlTtlSec);
    if (error) {
      storageUrlByAsset.set(cacheKey, null);
      continue;
    }
    storageUrlByAsset.set(cacheKey, data?.signedUrl ?? null);
  }

  return {
    board: {
      size: 9,
      placements: (placementRes.data ?? []).map((row: any) => {
        const piece = toPieceRow(row);
        const assetKey =
          piece?.image_bucket && piece?.image_key
            ? `${piece.image_bucket}::${piece.image_key}`
            : null;
        return {
          side: row.side,
          row: row.row_no,
          col: row.col_no,
          piece: {
            id: row.piece_id,
            code: piece?.piece_code ?? null,
            char: piece?.kanji ?? null,
            name: piece?.name ?? null,
            imageBucket: piece?.image_bucket ?? null,
            imageKey: piece?.image_key ?? null,
            imageSignedUrl: assetKey ? (storageUrlByAsset.get(assetKey) ?? null) : null,
            movePatternId: piece?.move_pattern_id ?? null,
            skillId: piece?.skill_id ?? null,
          },
        };
      }),
    },
    enemyRoster: (rosterRes.data ?? []).map((row: any) => ({
      role: row.role,
      weight: row.weight,
      piece: {
        id: row.piece_id,
        code: row.m_piece?.piece_code ?? null,
        char: row.m_piece?.kanji ?? null,
        name: row.m_piece?.name ?? null,
      },
    })),
    rewards: rewards.map((row: any) => ({
      timing: row.reward_timing,
      quantity: row.quantity,
      dropRate: row.drop_rate,
      sortOrder: row.sort_order,
      reward: {
        code: row.m_reward?.reward_code ?? null,
        type: row.m_reward?.reward_type ?? null,
        name: row.m_reward?.reward_name ?? null,
        itemCode: row.m_reward?.item_code ?? null,
        pieceId: row.m_reward?.piece_id ?? null,
      },
    })),
  };
}
