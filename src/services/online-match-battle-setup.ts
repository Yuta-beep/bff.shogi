import { supabaseAdmin } from '@/lib/supabase-admin';

type BattleSetupStatus = 'draft' | 'validated' | 'locked' | 'consumed';

export type BattleSetupPlacement = {
  row: number;
  col: number;
  pieceId: number;
  pieceCode: string;
};

export type BattleSetupHandPiece = {
  pieceId: number;
  pieceCode: string;
  count: number;
};

export type BattleSetupPayload = {
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
};

export type BattleSetupRecord = {
  battleSetupId: string;
  ownerUserId: string;
  status: BattleSetupStatus;
  name: string | null;
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
  validationSummary: {
    boardPieceCount: number;
    handPieceCount: number;
    totalSelectedPieces: number;
  };
  createdAt: string;
  updatedAt: string;
};

type BattleSetupRow = {
  battle_setup_id: string;
  owner_user_id: string;
  status: BattleSetupStatus;
  name: string | null;
  board_layout: BattleSetupPlacement[];
  hands_layout: BattleSetupHandPiece[];
  selected_piece_ids: number[];
  validation_summary: BattleSetupRecord['validationSummary'];
  created_at: string;
  updated_at: string;
};

export async function saveBattleSetup(input: {
  ownerUserId: string;
  name?: string | null;
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
}) {
  validatePayload(input);
  const now = new Date().toISOString();
  const battleSetupId = `bsetup_${Math.random().toString(36).slice(2, 10)}`;
  const record: BattleSetupRecord = {
    battleSetupId,
    ownerUserId: input.ownerUserId,
    status: 'draft',
    name: input.name?.trim() || null,
    boardLayout: input.boardLayout.map((entry) => ({ ...entry })),
    handsLayout: input.handsLayout.map((entry) => ({ ...entry })),
    selectedPieceIds: [...input.selectedPieceIds],
    validationSummary: summarize(input),
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await supabaseAdmin.from('online_match_battle_setups').insert(toRow(record));
  if (error) throw error;
  return record;
}

export async function validateBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = await requireBattleSetup(ownerUserId, battleSetupId);
  validatePayload({
    boardLayout: current.boardLayout,
    handsLayout: current.handsLayout,
    selectedPieceIds: current.selectedPieceIds,
  });
  const next: BattleSetupRecord = {
    ...current,
    status: 'validated',
    validationSummary: summarize(current),
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('online_match_battle_setups')
    .update(toRowPatch(next))
    .eq('battle_setup_id', battleSetupId)
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return next;
}

export async function getBattleSetup(ownerUserId: string, battleSetupId: string) {
  return requireBattleSetup(ownerUserId, battleSetupId);
}

export async function lockBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = await requireBattleSetup(ownerUserId, battleSetupId);
  if (current.status !== 'validated' && current.status !== 'locked') {
    throw new Error('Battle setup must be validated before lock');
  }
  const next: BattleSetupRecord = {
    ...current,
    status: 'locked',
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('online_match_battle_setups')
    .update(toRowPatch(next))
    .eq('battle_setup_id', battleSetupId)
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return next;
}

export async function consumeBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = await requireBattleSetup(ownerUserId, battleSetupId);
  if (current.status !== 'locked' && current.status !== 'consumed') {
    throw new Error('Battle setup must be locked before consume');
  }
  const next: BattleSetupRecord = {
    ...current,
    status: 'consumed',
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('online_match_battle_setups')
    .update(toRowPatch(next))
    .eq('battle_setup_id', battleSetupId)
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return next;
}

async function requireBattleSetup(ownerUserId: string, battleSetupId: string) {
  const { data, error } = await supabaseAdmin
    .from('online_match_battle_setups')
    .select('*')
    .eq('battle_setup_id', battleSetupId)
    .eq('owner_user_id', ownerUserId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Battle setup not found');
  }
  return fromRow(data as BattleSetupRow);
}

function summarize(input: BattleSetupPayload) {
  return {
    boardPieceCount: input.boardLayout.length,
    handPieceCount: input.handsLayout.reduce((sum, entry) => sum + Math.max(0, entry.count), 0),
    totalSelectedPieces: input.selectedPieceIds.length,
  };
}

function toRow(record: BattleSetupRecord): BattleSetupRow {
  return {
    battle_setup_id: record.battleSetupId,
    owner_user_id: record.ownerUserId,
    status: record.status,
    name: record.name,
    board_layout: record.boardLayout,
    hands_layout: record.handsLayout,
    selected_piece_ids: record.selectedPieceIds,
    validation_summary: record.validationSummary,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toRowPatch(record: BattleSetupRecord) {
  const row = toRow(record);
  return {
    status: row.status,
    name: row.name,
    board_layout: row.board_layout,
    hands_layout: row.hands_layout,
    selected_piece_ids: row.selected_piece_ids,
    validation_summary: row.validation_summary,
    updated_at: row.updated_at,
  };
}

function fromRow(row: BattleSetupRow): BattleSetupRecord {
  return {
    battleSetupId: row.battle_setup_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    name: row.name,
    boardLayout: row.board_layout ?? [],
    handsLayout: row.hands_layout ?? [],
    selectedPieceIds: row.selected_piece_ids ?? [],
    validationSummary: row.validation_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validatePayload(input: BattleSetupPayload) {
  const occupied = new Set<string>();
  for (const piece of input.boardLayout) {
    if (
      !Number.isInteger(piece.row) ||
      !Number.isInteger(piece.col) ||
      piece.row < 0 ||
      piece.row > 8 ||
      piece.col < 0 ||
      piece.col > 8
    ) {
      throw new Error('boardLayout contains invalid coordinates');
    }
    if (!Number.isInteger(piece.pieceId) || piece.pieceId <= 0) {
      throw new Error('boardLayout contains invalid pieceId');
    }
    if (!piece.pieceCode?.trim()) {
      throw new Error('boardLayout contains invalid pieceCode');
    }
    const key = `${piece.row}:${piece.col}`;
    if (occupied.has(key)) {
      throw new Error('boardLayout contains duplicated cells');
    }
    occupied.add(key);
  }

  for (const piece of input.handsLayout) {
    if (!Number.isInteger(piece.pieceId) || piece.pieceId <= 0) {
      throw new Error('handsLayout contains invalid pieceId');
    }
    if (!piece.pieceCode?.trim()) {
      throw new Error('handsLayout contains invalid pieceCode');
    }
    if (!Number.isInteger(piece.count) || piece.count < 0) {
      throw new Error('handsLayout contains invalid count');
    }
  }

  if (
    !Array.isArray(input.selectedPieceIds) ||
    input.selectedPieceIds.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    throw new Error('selectedPieceIds must be positive integers');
  }
}
