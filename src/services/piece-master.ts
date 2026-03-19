import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';

type MoveRule = {
  ruleType: string;
  priority: number;
  params: Record<string, unknown>;
};

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
    'm_move_pattern:move_pattern_id(move_code,move_name,is_repeatable,can_jump,constraints_json,m_move_pattern_vector(dx,dy,max_step))';
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
  const signedUrlTtlSec = 60 * 60;

  for (const row of piecesRes.data ?? []) {
    const bucket = (row as any).image_bucket as string | null | undefined;
    const key = (row as any).image_key as string | null | undefined;
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
      const vectors: { dx: number; dy: number; maxStep: number }[] = (
        pattern?.m_move_pattern_vector ?? []
      ).map((v: any) => ({ dx: v.dx, dy: v.dy, maxStep: v.max_step }));
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
        skill: row.m_skill?.skill_desc ?? 'なし',
        move: row.move_description_ja ?? pattern?.move_name ?? pattern?.move_code ?? '',
        moveVectors: vectors,
        isRepeatable: pattern?.is_repeatable ?? false,
        canJump: pattern?.can_jump ?? false,
        moveConstraints: (pattern?.constraints_json ?? null) as Record<string, unknown> | null,
        moveRules: rules,
      };
    });
}
