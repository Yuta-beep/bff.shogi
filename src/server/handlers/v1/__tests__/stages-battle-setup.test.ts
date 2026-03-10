import { describe, expect, it } from 'bun:test';

import { createGetBattleSetup } from '../stages/battle-setup';
import { readJson } from './test-utils';

describe('GET /api/v1/stages/:stageNo/battle-setup', () => {
  it('returns 404 for missing stage', async () => {
    const handler = createGetBattleSetup({
      getStageByNo: async () => null,
      isPublishedNow: () => true,
      getStageBattleSetup: async () => ({ board: { size: 9, placements: [] }, enemyRoster: [], rewards: [] }),
    });
    const response = await handler('1');
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 and fixed shape on success', async () => {
    const handler = createGetBattleSetup({
      getStageByNo: async () => ({
        stage_id: 1,
        stage_no: 1,
        stage_name: 'S1',
        unlock_stage_no: null,
        difficulty: 1,
        stage_category: 'normal',
        clear_condition_type: 'defeat_boss',
        clear_condition_params: { target: 'boss' },
        recommended_power: null,
        stamina_cost: null,
        is_active: true,
        published_at: '2026-03-10T00:00:00.000Z',
        unpublished_at: null,
      }),
      isPublishedNow: () => true,
      getStageBattleSetup: async () => ({
        board: { size: 9, placements: [] },
        enemyRoster: [],
        rewards: [],
      }),
    });

    const response = await handler('1');
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        stage: {
          stageNo: 1,
          stageName: 'S1',
          clearConditionType: 'defeat_boss',
          clearConditionParams: { target: 'boss' },
          stageCategory: 'normal',
        },
        labels: {
          stageLabel: 'STAGE 1',
          turnLabel: 'TURN 1',
          handLabel: '持ち駒',
        },
        board: { size: 9, placements: [] },
        enemyRoster: [],
        rewards: [],
      },
    });
  });
});
