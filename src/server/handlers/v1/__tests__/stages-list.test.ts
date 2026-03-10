import { describe, expect, it } from 'bun:test';

import { createGetStageList } from '../stages/list';
import { readJson } from './test-utils';

describe('GET /api/v1/stages', () => {
  it('returns mapped stage fields with fixed defaults', async () => {
    const handler = createGetStageList({
      listPublishedStages: async () => [
        {
          stage_id: 1,
          stage_no: 1,
          stage_name: 'Stage 1',
          unlock_stage_no: null,
          difficulty: 2,
          stage_category: null,
          clear_condition_type: null,
          clear_condition_params: null,
          recommended_power: null,
          stamina_cost: null,
          is_active: true,
          published_at: '2026-03-10T00:00:00.000Z',
          unpublished_at: null,
        },
      ],
    });

    const response = await handler();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        stages: [
          {
            stageNo: 1,
            stageName: 'Stage 1',
            unlockStageNo: null,
            difficulty: 2,
            stageCategory: 'normal',
            clearConditionType: 'defeat_boss',
            clearConditionParams: {},
            recommendedPower: null,
            staminaCost: 0,
            canStart: true,
          },
        ],
        note: 'NO_USER_PROGRESS_TABLE_YET',
      },
    });
  });
});
