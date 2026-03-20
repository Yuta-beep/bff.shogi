import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPublishedNow } from '@/lib/time';
import { getStageBattleSetup, getStageByNo } from '@/services/stage-master';
import { deductPlayerStamina, InsufficientStaminaError } from '@/services/stamina';

type BattleSetupDeps = {
  getStageByNo: typeof getStageByNo;
  isPublishedNow: typeof isPublishedNow;
  getStageBattleSetup: typeof getStageBattleSetup;
  deductPlayerStamina: typeof deductPlayerStamina;
};

export function optionsBattleSetup() {
  return optionsResponse();
}

export function createGetBattleSetup(
  deps: BattleSetupDeps = {
    getStageByNo,
    isPublishedNow,
    getStageBattleSetup,
    deductPlayerStamina,
  },
) {
  return async function getBattleSetup(stageNoRaw: string, req?: Request) {
    const stageNo = Number(stageNoRaw);

    if (!Number.isInteger(stageNo) || stageNo <= 0) {
      return jsonError('INVALID_STAGE_NO', 'stageNo must be a positive integer', 400);
    }

    try {
      const stage = await deps.getStageByNo(stageNo);
      if (!stage) {
        return jsonError('NOT_FOUND', `Stage ${stageNo} not found`, 404);
      }
      if (!deps.isPublishedNow(stage)) {
        return jsonError('LOCKED', `Stage ${stageNo} is locked`, 403);
      }

      let userId: string | null = null;
      const auth = req?.headers.get('Authorization') ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data?.user?.id) {
          userId = data.user.id;
        }
      }

      const staminaCost = Number(stage.stamina_cost ?? 0);
      if (staminaCost > 0) {
        if (!userId) {
          return jsonError('UNAUTHORIZED', 'Authentication required to enter this stage', 401);
        }
        await deps.deductPlayerStamina(userId, staminaCost);
      }

      const setup = await deps.getStageBattleSetup(stage.stage_id, userId);

      return jsonOk({
        stage: {
          stageNo: stage.stage_no,
          stageName: stage.stage_name,
          clearConditionType: stage.clear_condition_type ?? 'defeat_boss',
          clearConditionParams: stage.clear_condition_params ?? {},
          stageCategory: stage.stage_category ?? 'normal',
        },
        labels: {
          stageLabel: `STAGE ${stage.stage_no}`,
          turnLabel: 'TURN 1',
          handLabel: '持ち駒',
        },
        ...setup,
      });
    } catch (error: any) {
      if (error instanceof InsufficientStaminaError) {
        return jsonError(
          'INSUFFICIENT_STAMINA',
          `Stamina insufficient: ${error.current} / ${error.required} required`,
          422,
        );
      }
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load battle setup', 500);
    }
  };
}

export const getBattleSetup = createGetBattleSetup();
