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

const STAGE_MASTER_TTL_MS = 60_000;

let cachedStageRows: StageRow[] | null = null;
let cachedStageRowsAt = 0;
let stageRowsInFlight: Promise<StageRow[]> | null = null;

async function loadStageRows(force = false): Promise<StageRow[]> {
  const now = Date.now();
  if (!force && cachedStageRows && now - cachedStageRowsAt < STAGE_MASTER_TTL_MS) {
    return cachedStageRows;
  }
  if (stageRowsInFlight) return stageRowsInFlight;

  stageRowsInFlight = (async () => {
    const { data, error } = await supabaseAdmin
      .schema('master')
      .from('m_stage')
      .select(
        'stage_id,stage_no,stage_name,unlock_stage_no,difficulty,stage_category,clear_condition_type,clear_condition_params,recommended_power,stamina_cost,is_active,published_at,unpublished_at',
      )
      .order('stage_no', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as StageRow[];
    cachedStageRows = rows;
    cachedStageRowsAt = Date.now();
    return rows;
  })().finally(() => {
    stageRowsInFlight = null;
  });

  return stageRowsInFlight;
}

export async function listPublishedStages() {
  const rows = await loadStageRows();
  return rows.filter((row) => isPublishedNow(row));
}

export async function getStageByNo(stageNo: number) {
  const rows = await loadStageRows();
  return rows.find((row) => row.stage_no === stageNo) ?? null;
}

export async function getStageNoByIdMap(): Promise<Map<number, number>> {
  const rows = await loadStageRows();
  return new Map(rows.map((row) => [row.stage_id, row.stage_no]));
}

export async function getStageBattleSetup(
  stageId: number,
  playerId?: string | null,
  stageNo?: number,
) {
  const boardSize = 9;
  const deckRowCount = 3;
  const playerDeckRowOffset = boardSize - deckRowCount;
  const toBoardRowFromDeck = (rowNo: number) =>
    rowNo >= 0 && rowNo < deckRowCount ? rowNo + playerDeckRowOffset : rowNo;
  const toPieceRow = (row: any) => {
    if (Array.isArray(row?.m_piece)) {
      return row.m_piece[0] ?? null;
    }
    return row?.m_piece ?? null;
  };

  const placementPromise = supabaseAdmin
    .schema('master')
    .from('m_stage_initial_placement')
    .select(
      'side,row_no,col_no,piece_id,m_piece:piece_id(piece_code,kanji,name,move_pattern_id,skill_id,image_bucket,image_key)',
    )
    .eq('stage_id', stageId)
    .order('side', { ascending: true })
    .order('row_no', { ascending: true })
    .order('col_no', { ascending: true });

  const rosterPromise = supabaseAdmin
    .schema('master')
    .from('m_stage_piece')
    .select('role,weight,piece_id,m_piece:piece_id(piece_code,kanji,name)')
    .eq('stage_id', stageId)
    .order('role', { ascending: true });

  const rewardPromise = supabaseAdmin
    .schema('master')
    .from('m_stage_reward')
    .select(
      'reward_timing,quantity,drop_rate,sort_order,m_reward:reward_id(reward_code,reward_type,reward_name,item_code,piece_id)',
    )
    .eq('stage_id', stageId)
    .order('sort_order', { ascending: true });

  const deckPromise = playerId
    ? supabaseAdmin
        .from('player_decks')
        .select('deck_id,name,player_deck_placements(row_no,col_no,piece_id)')
        .eq('player_id', playerId)
        .order('deck_id', { ascending: true })
    : Promise.resolve(null);

  const [placementRes, rosterRes, rewardRes, deckRes] = await Promise.all([
    placementPromise,
    rosterPromise,
    rewardPromise,
    deckPromise,
  ]);

  if (placementRes.error) throw placementRes.error;
  if (rosterRes.error) throw rosterRes.error;

  const stagePlacementRows = (placementRes.data ?? []) as any[];
  let playerPlacementRowsFromDeck: any[] = [];

  if (deckRes && !deckRes.error) {
    try {
      const deckList = (deckRes.data ?? []) as Array<{
        deck_id: number;
        name: string;
        player_deck_placements?: Array<{ row_no: number; col_no: number; piece_id: number }>;
      }>;
      const targetDeck =
        deckList.find(
          (deck) => deck.name === 'マイデッキ' && (deck.player_deck_placements?.length ?? 0) > 0,
        ) ?? deckList.find((deck) => (deck.player_deck_placements?.length ?? 0) > 0);

      if (targetDeck?.player_deck_placements && targetDeck.player_deck_placements.length > 0) {
        const pieceIds = [
          ...new Set(
            targetDeck.player_deck_placements
              .map((p) => p.piece_id)
              .filter((id): id is number => typeof id === 'number'),
          ),
        ];
        if (pieceIds.length > 0) {
          const pieceRes = await supabaseAdmin
            .schema('master')
            .from('m_piece')
            .select(
              'piece_id,piece_code,kanji,name,move_pattern_id,skill_id,image_bucket,image_key',
            )
            .in('piece_id', pieceIds);

          if (!pieceRes.error) {
            const pieceById = new Map<number, any>(
              (pieceRes.data ?? []).map((piece: any) => [piece.piece_id, piece]),
            );
            playerPlacementRowsFromDeck = targetDeck.player_deck_placements
              .map((placement) => {
                const piece = pieceById.get(placement.piece_id);
                if (!piece) return null;
                const rowNo = Number(placement.row_no);
                const colNo = Number(placement.col_no);
                if (!Number.isInteger(rowNo) || !Number.isInteger(colNo)) {
                  return null;
                }
                return {
                  side: 'player',
                  row_no: toBoardRowFromDeck(rowNo),
                  col_no: colNo,
                  piece_id: placement.piece_id,
                  m_piece: piece,
                };
              })
              .filter((row): row is any => row !== null);
          }
        }
      }
    } catch {
      playerPlacementRowsFromDeck = [];
    }
  }

  const mergedPlacementRows =
    playerPlacementRowsFromDeck.length > 0
      ? [
          ...stagePlacementRows.filter((row) => row.side === 'enemy'),
          ...playerPlacementRowsFromDeck,
        ]
      : stagePlacementRows;

  if (stageNo === 39) {
    await applyStage39OniVariants(mergedPlacementRows);
  }

  const rewards = rewardRes.error ? [] : (rewardRes.data ?? []);

  return {
    board: {
      size: 9,
      placements: mergedPlacementRows.map((row: any) => {
        const piece = toPieceRow(row);
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

async function applyStage39OniVariants(placementRows: any[]): Promise<void> {
  const enemyOniRows = placementRows
    .filter((row) => {
      const piece = Array.isArray(row?.m_piece) ? row.m_piece[0] : row?.m_piece;
      return row?.side === 'enemy' && piece?.kanji === '鬼';
    })
    .sort((a, b) => a.col_no - b.col_no || a.row_no - b.row_no);

  if (enemyOniRows.length < 2) return;

  const left = enemyOniRows[0];
  const right = enemyOniRows[enemyOniRows.length - 1];

  const leftPiece = Array.isArray(left?.m_piece) ? left.m_piece[0] : left?.m_piece;
  const rightPiece = Array.isArray(right?.m_piece) ? right.m_piece[0] : right?.m_piece;
  if (!leftPiece || !rightPiece) return;

  leftPiece.piece_code = 'blueOni';
  leftPiece.name = '青鬼';
  rightPiece.piece_code = 'blackOni';
  rightPiece.name = '黒鬼';
}
