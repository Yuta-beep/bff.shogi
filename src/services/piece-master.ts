import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';

type MoveRule = {
  ruleType: string;
  priority: number;
  params: Record<string, unknown>;
};

const PIECE_CATALOG_TTL_MS = 60_000;

let cachedPieceCatalog: Awaited<ReturnType<typeof buildPieceCatalog>> | null = null;
let cachedPieceCatalogAt = 0;
let pieceCatalogInFlight: Promise<Awaited<ReturnType<typeof buildPieceCatalog>>> | null = null;

export function clearPieceCatalogCache(): void {
  cachedPieceCatalog = null;
  cachedPieceCatalogAt = 0;
  pieceCatalogInFlight = null;
}

export async function listPieceCatalog() {
  const now = Date.now();
  if (cachedPieceCatalog && now - cachedPieceCatalogAt < PIECE_CATALOG_TTL_MS) {
    return cachedPieceCatalog;
  }
  if (pieceCatalogInFlight) return pieceCatalogInFlight;

  pieceCatalogInFlight = buildPieceCatalog().finally(() => {
    pieceCatalogInFlight = null;
  });

  const catalog = await pieceCatalogInFlight;
  cachedPieceCatalog = catalog;
  cachedPieceCatalogAt = Date.now();
  return catalog;
}

async function buildPieceCatalog() {
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

  const mappingRes = await supabaseAdmin
    .schema('master')
    .from('m_piece_mapping')
    .select('piece_id,sfen_code,canonical_piece_code,is_promoted')
    .eq('is_active', true);

  if (mappingRes.error) throw mappingRes.error;

  const mappingByPieceId = new Map<
    number,
    {
      sfenCode: string | null;
      canonicalCode: string;
      isPromoted: boolean;
    }
  >();

  for (const row of mappingRes.data ?? []) {
    const pieceId = Number((row as any).piece_id);
    if (!Number.isFinite(pieceId)) continue;
    mappingByPieceId.set(pieceId, {
      sfenCode: ((row as any).sfen_code as string | null) ?? null,
      canonicalCode: String((row as any).canonical_piece_code ?? ''),
      isPromoted: Boolean((row as any).is_promoted),
    });
  }

  return (piecesRes.data ?? [])
    .filter((row: any) => isPublishedNow(row))
    .map((row: any) => {
      const pattern = row.m_move_pattern;
      const mapping = mappingByPieceId.get(row.piece_id);
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
        sfenCode: mapping?.sfenCode ?? null,
        canonicalCode: mapping?.canonicalCode ?? null,
        isPromoted: mapping?.isPromoted ?? false,
        moveCode: pattern?.move_code ?? null,
        char: row.kanji,
        name: row.name,
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
