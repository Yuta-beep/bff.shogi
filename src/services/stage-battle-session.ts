import { effectiveStageStaminaCost } from '@/lib/stage-stamina';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';
import { getStageBattleSetup, getStageByNo } from '@/services/stage-master';
import { deductPlayerStamina, InsufficientStaminaError } from '@/services/stamina';

const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type StageBattleSessionStartResult = {
  battleSessionId: string;
  expiresAt: string;
  stage: {
    stageNo: number;
    stageName: string;
    clearConditionType: string;
    clearConditionParams: Record<string, unknown>;
    stageCategory: string;
  };
  labels: {
    stageLabel: string;
    turnLabel: string;
    handLabel: string;
  };
  board: {
    size: number;
    placements: {
      side: string;
      row: number;
      col: number;
      piece: {
        id: number;
        code: string | null;
        char: string | null;
        name: string | null;
        imageBucket: string | null;
        imageKey: string | null;
        movePatternId: number | null;
        skillId: number | null;
      };
    }[];
  };
  enemyRoster: {
    role: string;
    weight: number;
    piece: {
      id: number;
      code: string | null;
      char: string | null;
      name: string | null;
    };
  }[];
  rewards: {
    timing: string;
    quantity: number;
    dropRate: number | null;
    sortOrder: number;
    reward: {
      code: string | null;
      type: string | null;
      name: string | null;
      itemCode: string | null;
      pieceId: number | null;
    };
  }[];
};

export type FinishStageBattleSessionInput = {
  battleSessionId: string;
  result: 'cleared' | 'failed';
  finalSnapshotHash?: string | null;
  finishPayload?: Record<string, unknown>;
};

export type FinishStageBattleSessionResult = {
  battleSessionId: string;
  status: 'finished';
  result: 'cleared' | 'failed';
  stageNo: number;
  clearApplied: boolean;
  firstClear: boolean;
  clearCount: number | null;
  granted: {
    pawn: number;
    gold: number;
    pieces: {
      pieceId: number;
      char: string;
      name: string;
      quantity: number;
    }[];
  };
  wallet: {
    pawnCurrency: number;
    goldCurrency: number;
  };
};

export class StageBattleSessionError extends Error {
  readonly code:
    | 'NOT_FOUND'
    | 'LOCKED'
    | 'UNAUTHORIZED'
    | 'INVALID_STAGE_NO'
    | 'INSUFFICIENT_STAMINA'
    | 'INVALID_RESULT'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_EXPIRED'
    | 'INTERNAL_ERROR';

  constructor(code: StageBattleSessionError['code'], message: string) {
    super(message);
    this.name = 'StageBattleSessionError';
    this.code = code;
  }
}

type StartStageBattleSessionDeps = {
  getStageByNo: typeof getStageByNo;
  isPublishedNow: typeof isPublishedNow;
  getStageBattleSetup: typeof getStageBattleSetup;
  deductPlayerStamina: typeof deductPlayerStamina;
  ttlMs?: number;
};

type FinishStageBattleSessionDeps = {
  rpcFinishStageBattleSession: (
    input: FinishStageBattleSessionInput & { playerId: string },
  ) => Promise<FinishStageBattleSessionResult>;
};

export function createStartStageBattleSession(
  deps: StartStageBattleSessionDeps = {
    getStageByNo,
    isPublishedNow,
    getStageBattleSetup,
    deductPlayerStamina,
  },
) {
  return async function startStageBattleSession(input: {
    playerId: string;
    stageNo: number;
    clientVersion?: string | null;
  }): Promise<StageBattleSessionStartResult> {
    if (!input.playerId) {
      throw new StageBattleSessionError('UNAUTHORIZED', 'Authentication required');
    }
    if (!Number.isInteger(input.stageNo) || input.stageNo <= 0) {
      throw new StageBattleSessionError('INVALID_STAGE_NO', 'stageNo must be a positive integer');
    }

    const stage = await deps.getStageByNo(input.stageNo);
    if (!stage) {
      throw new StageBattleSessionError('NOT_FOUND', `Stage ${input.stageNo} not found`);
    }
    if (!deps.isPublishedNow(stage)) {
      throw new StageBattleSessionError('LOCKED', `Stage ${input.stageNo} is locked`);
    }

    await expireOpenSessions(input.playerId);

    const staminaCost = effectiveStageStaminaCost(stage.stamina_cost);
    try {
      if (staminaCost > 0) {
        await deps.deductPlayerStamina(input.playerId, staminaCost);
      }
    } catch (error) {
      if (error instanceof InsufficientStaminaError) {
        throw new StageBattleSessionError(
          'INSUFFICIENT_STAMINA',
          `Stamina insufficient: ${error.current} / ${error.required} required`,
        );
      }
      throw error;
    }

    const setup = await deps.getStageBattleSetup(stage.stage_id, input.playerId);
    const expiresAt = new Date(Date.now() + (deps.ttlMs ?? DEFAULT_SESSION_TTL_MS)).toISOString();

    const snapshot = {
      stage: {
        stageNo: stage.stage_no,
        stageName: stage.stage_name,
        clearConditionType: stage.clear_condition_type ?? 'defeat_boss',
        clearConditionParams: stage.clear_condition_params ?? {},
        stageCategory: stage.stage_category ?? 'normal',
      },
      labels: {
        stageLabel: stage.stage_name,
        turnLabel: 'TURN 1',
        handLabel: '持ち駒',
      },
      ...setup,
    };

    const { data, error } = await supabaseAdmin
      .schema('game')
      .from('games')
      .insert({
        player_id: input.playerId,
        stage_id: stage.stage_id,
        status: 'in_progress',
        client_version: input.clientVersion ?? null,
        expires_at: expiresAt,
        initial_snapshot: snapshot,
      })
      .select('game_id')
      .single();

    if (error || !data?.game_id) {
      throw new StageBattleSessionError(
        'INTERNAL_ERROR',
        error?.message ?? 'Failed to create stage battle session',
      );
    }

    return {
      battleSessionId: data.game_id as string,
      expiresAt,
      stage: snapshot.stage,
      labels: snapshot.labels,
      board: setup.board,
      enemyRoster: setup.enemyRoster,
      rewards: setup.rewards,
    };
  };
}

export const startStageBattleSession = createStartStageBattleSession();

export function createFinishStageBattleSession(
  deps: FinishStageBattleSessionDeps = {
    rpcFinishStageBattleSession,
  },
) {
  return async function finishStageBattleSession(input: {
    playerId: string;
    battleSessionId: string;
    result: 'cleared' | 'failed';
    finalSnapshotHash?: string | null;
    finishPayload?: Record<string, unknown>;
  }): Promise<FinishStageBattleSessionResult> {
    if (!input.playerId) {
      throw new StageBattleSessionError('UNAUTHORIZED', 'Authentication required');
    }
    if (!input.battleSessionId) {
      throw new StageBattleSessionError('SESSION_NOT_FOUND', 'battleSessionId is required');
    }
    if (input.result !== 'cleared' && input.result !== 'failed') {
      throw new StageBattleSessionError('INVALID_RESULT', 'result must be one of cleared, failed');
    }

    return deps.rpcFinishStageBattleSession(input);
  };
}

export const finishStageBattleSession = createFinishStageBattleSession();

async function expireOpenSessions(playerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update({
      status: 'aborted',
      result: 'abort',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', playerId)
    .eq('status', 'in_progress')
    .not('stage_id', 'is', null);

  if (error) {
    throw new StageBattleSessionError('INTERNAL_ERROR', error.message);
  }
}

async function rpcFinishStageBattleSession(
  input: FinishStageBattleSessionInput & { playerId: string },
): Promise<FinishStageBattleSessionResult> {
  const { data, error } = await supabaseAdmin.rpc('finish_stage_battle_game_session', {
    p_game_id: input.battleSessionId,
    p_player_id: input.playerId,
    p_result: input.result,
    p_final_snapshot_hash: input.finalSnapshotHash ?? null,
    p_finish_payload: input.finishPayload ?? {},
  });

  if (error) {
    if (error.message.includes('SESSION_NOT_FOUND')) {
      throw new StageBattleSessionError('SESSION_NOT_FOUND', 'stage battle session not found');
    }
    if (error.message.includes('SESSION_EXPIRED')) {
      throw new StageBattleSessionError('SESSION_EXPIRED', 'stage battle session expired');
    }
    if (error.message.includes('INVALID_RESULT')) {
      throw new StageBattleSessionError('INVALID_RESULT', 'result must be one of cleared, failed');
    }
    throw new StageBattleSessionError('INTERNAL_ERROR', error.message);
  }

  return data as FinishStageBattleSessionResult;
}
