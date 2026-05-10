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

const store = new Map<string, BattleSetupRecord>();

export async function saveBattleSetup(input: {
  ownerUserId: string;
  name?: string | null;
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
}) {
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
  store.set(battleSetupId, record);
  return record;
}

export async function validateBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = requireBattleSetup(ownerUserId, battleSetupId);
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
  store.set(battleSetupId, next);
  return next;
}

export async function getBattleSetup(ownerUserId: string, battleSetupId: string) {
  return requireBattleSetup(ownerUserId, battleSetupId);
}

export async function lockBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = requireBattleSetup(ownerUserId, battleSetupId);
  if (current.status !== 'validated' && current.status !== 'locked') {
    throw new Error('Battle setup must be validated before lock');
  }
  const next: BattleSetupRecord = {
    ...current,
    status: 'locked',
    updatedAt: new Date().toISOString(),
  };
  store.set(battleSetupId, next);
  return next;
}

function requireBattleSetup(ownerUserId: string, battleSetupId: string) {
  const current = store.get(battleSetupId);
  if (!current || current.ownerUserId !== ownerUserId) {
    throw new Error('Battle setup not found');
  }
  return current;
}

function summarize(input: BattleSetupPayload) {
  return {
    boardPieceCount: input.boardLayout.length,
    handPieceCount: input.handsLayout.reduce((sum, entry) => sum + Math.max(0, entry.count), 0),
    totalSelectedPieces: input.selectedPieceIds.length,
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
