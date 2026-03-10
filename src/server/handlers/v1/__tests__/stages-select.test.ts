import { describe, expect, it } from 'bun:test';

import { createPostStageSelect } from '../stages/select';
import { readJson } from './test-utils';

describe('POST /api/v1/stages/:stageNo/select', () => {
  it('returns 400 when stageNo is invalid', async () => {
    const handler = createPostStageSelect({
      getStageByNo: async () => null,
      isPublishedNow: () => false,
    });
    const response = await handler('abc');
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_STAGE_NO');
  });

  it('returns canStart false with NOT_FOUND for missing stage', async () => {
    const handler = createPostStageSelect({
      getStageByNo: async () => null,
      isPublishedNow: () => true,
    });
    const response = await handler('1');
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, data: { canStart: false, reason: 'NOT_FOUND' } });
  });

  it('returns canStart true with note for published stage', async () => {
    const handler = createPostStageSelect({
      getStageByNo: async () => ({
        stage_id: 1,
        stage_no: 1,
        stage_name: 'S1',
        unlock_stage_no: null,
        difficulty: 1,
        stage_category: 'normal',
        clear_condition_type: 'defeat_boss',
        clear_condition_params: {},
        recommended_power: 100,
        stamina_cost: 1,
        is_active: true,
        published_at: '2026-03-10T00:00:00.000Z',
        unpublished_at: null,
      }),
      isPublishedNow: () => true,
    });
    const response = await handler('1');
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { canStart: true, note: 'NO_USER_PROGRESS_TABLE_YET' },
    });
  });
});
