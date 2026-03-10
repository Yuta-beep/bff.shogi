import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';

export async function listPieceCatalog() {
  const piecesRes = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select(
      'piece_id,kanji,name,piece_code,move_pattern_id,skill_id,is_active,published_at,unpublished_at,' +
        'm_skill:skill_id(skill_name,skill_desc),' +
        'm_move_pattern:move_pattern_id(move_code,move_name,is_repeatable,m_move_pattern_vector(dx,dy,max_step))',
    )
    .order('piece_id', { ascending: true });

  if (piecesRes.error) throw piecesRes.error;

  const stagePieceRes = await supabaseAdmin
    .schema('master')
    .from('m_stage_piece')
    .select('piece_id,m_stage:stage_id(stage_no)');

  if (stagePieceRes.error) throw stagePieceRes.error;

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
      const vectors: { dx: number; dy: number; maxStep: number }[] = (
        pattern?.m_move_pattern_vector ?? []
      ).map((v: any) => ({ dx: v.dx, dy: v.dy, maxStep: v.max_step }));
      return {
        char: row.kanji,
        name: row.name,
        unlock: unlockStageByPieceId.has(row.piece_id)
          ? `Stage ${unlockStageByPieceId.get(row.piece_id)}`
          : '初期',
        desc: row.m_skill?.skill_desc ?? '',
        skill: row.m_skill?.skill_name ?? 'なし',
        move: pattern?.move_name ?? pattern?.move_code ?? '',
        moveVectors: vectors,
        isRepeatable: pattern?.is_repeatable ?? false,
      };
    });
}
