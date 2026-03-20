import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorageAssetUrl } from '@/lib/storage-asset-url';
import { isPublishedNow } from '@/lib/time';

type StageRow = {
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

type MoveRule = {
  ruleType: string;
  priority: number;
  params: Record<string, unknown>;
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

  const rows = ((data ?? []) as StageRow[]).filter((row) => isPublishedNow(row));
  return rows;
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

  for (const row of placementRes.data ?? []) {
    const piece = toPieceRow(row);
    const bucket = piece?.image_bucket as string | null | undefined;
    const key = piece?.image_key as string | null | undefined;
    if (!bucket || !key) continue;

    const cacheKey = `${bucket}::${key}`;
    if (storageUrlByAsset.has(cacheKey)) continue;

    const imageUrl = await getStorageAssetUrl(bucket, key);
    storageUrlByAsset.set(cacheKey, imageUrl);
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

export async function listPieceCatalog() {
  const fetchPieces = async (
    select: string,
  ): Promise<{ data: any[] | null; error: { message?: string } | null }> =>
    (await supabaseAdmin
      .schema('master')
      .from('m_piece')
      .select(select)
      .order('piece_id', { ascending: true })) as {
      data: any[] | null;
      error: { message?: string } | null;
    };

  const piecesSelectLegacy =
    'piece_id,kanji,name,piece_code,move_pattern_id,skill_id,image_bucket,image_key,is_active,published_at,unpublished_at,' +
    'm_skill:skill_id(skill_name,skill_desc),' +
    'm_move_pattern:move_pattern_id(move_code,move_name,is_repeatable,can_jump,constraints_json,m_move_pattern_vector(dx,dy,max_step,capture_mode))';
  const piecesSelectWithDescription = `move_description_ja,${piecesSelectLegacy}`;

  let piecesRes = await fetchPieces(piecesSelectWithDescription);

  if (piecesRes.error && String(piecesRes.error.message ?? '').includes('move_description_ja')) {
    piecesRes = await fetchPieces(piecesSelectLegacy);
  }

  if (piecesRes.error) throw piecesRes.error;

  const stagePieceRes = await supabaseAdmin
    .schema('master')
    .from('m_stage_piece')
    .select('piece_id,m_stage:stage_id(stage_no)');

  if (stagePieceRes.error) throw stagePieceRes.error;

  const storageUrlByAsset = new Map<string, string | null>();

  for (const row of piecesRes.data ?? []) {
    const bucket = (row as any).image_bucket as string | null | undefined;
    const key = (row as any).image_key as string | null | undefined;
    if (!bucket || !key) continue;

    const cacheKey = `${bucket}::${key}`;
    if (storageUrlByAsset.has(cacheKey)) continue;

    const imageUrl = await getStorageAssetUrl(bucket, key);
    storageUrlByAsset.set(cacheKey, imageUrl);
  }

  const movePatternIds = [
    ...new Set(
      (piecesRes.data ?? [])
        .map((row: any) => row.move_pattern_id as number | null)
        .filter((id): id is number => typeof id === 'number'),
    ),
  ];
  const rulesByPatternId = new Map<number, MoveRule[]>();

  if (movePatternIds.length > 0) {
    const rulesRes = await supabaseAdmin
      .schema('master')
      .from('m_move_pattern_rule')
      .select('move_pattern_id,rule_type,priority,params_json,is_active')
      .in('move_pattern_id', movePatternIds);

    if (!rulesRes.error) {
      for (const row of rulesRes.data ?? []) {
        if ((row as any).is_active === false) continue;
        const patternId = (row as any).move_pattern_id as number;
        const current = rulesByPatternId.get(patternId) ?? [];
        current.push({
          ruleType: String((row as any).rule_type ?? 'custom'),
          priority: Number((row as any).priority ?? 100),
          params: ((row as any).params_json ?? {}) as Record<string, unknown>,
        });
        rulesByPatternId.set(patternId, current);
      }
      for (const [patternId, rules] of rulesByPatternId.entries()) {
        rules.sort((a, b) => a.priority - b.priority);
        rulesByPatternId.set(patternId, rules);
      }
    }
  }

  const unlockStageByPieceId = new Map<number, number>();

  for (const row of stagePieceRes.data ?? []) {
    const pieceId = (row as any).piece_id as number;
    const stageNo = (row as any).m_stage?.stage_no as number | undefined;
    if (!stageNo) continue;
    const current = unlockStageByPieceId.get(pieceId);
    if (!current || stageNo < current) {
      unlockStageByPieceId.set(pieceId, stageNo);
    }
  }

  return (piecesRes.data ?? [])
    .filter((row: any) => isPublishedNow(row))
    .map((row: any) => {
      const pattern = row.m_move_pattern;
      const rules: MoveRule[] = rulesByPatternId.get(row.move_pattern_id) ?? [];
      const vectors: { dx: number; dy: number; maxStep: number; captureMode: string | null }[] = (
        pattern?.m_move_pattern_vector ?? []
      ).map((v: any) => ({
        dx: v.dx,
        dy: v.dy,
        maxStep: v.max_step,
        captureMode: v.capture_mode ?? null,
      }));
      return {
        pieceId: row.piece_id,
        pieceCode: row.piece_code,
        moveCode: pattern?.move_code ?? null,
        char: row.kanji,
        name: row.name,
        imageSignedUrl:
          row.image_bucket && row.image_key
            ? (storageUrlByAsset.get(`${row.image_bucket}::${row.image_key}`) ?? null)
            : null,
        unlock: unlockStageByPieceId.has(row.piece_id)
          ? `Stage ${unlockStageByPieceId.get(row.piece_id)}`
          : '初期',
        desc: row.m_skill?.skill_desc ?? '',
        skill: row.m_skill?.skill_name ?? 'なし',
        move: row.move_description_ja ?? pattern?.move_name ?? pattern?.move_code ?? '',
        moveVectors: vectors,
        isRepeatable: pattern?.is_repeatable ?? false,
        canJump: pattern?.can_jump ?? false,
        moveConstraints: (pattern?.constraints_json ?? null) as Record<string, unknown> | null,
        moveRules: rules,
      };
    });
}
