import { describe, expect, it } from 'bun:test';

import { createPostStageBattleStart } from '../stage-battles/start';
import { jsonRequest, readJson } from './test-utils';
import { StageBattleSessionError } from '@/services/stage-battle-session';

describe('POST /api/v1/stage-battles/start', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createPostStageBattleStart({
      resolveUserId: async () => null,
      startStageBattleSession: async () => {
        throw new Error('should not be called');
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/start', { stageNo: 1 }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when stageNo is invalid', async () => {
    const handler = createPostStageBattleStart({
      resolveUserId: async () => 'user-1',
      startStageBattleSession: async () => {
        throw new StageBattleSessionError('INVALID_STAGE_NO', 'stageNo must be a positive integer');
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/start', { stageNo: 'x' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_STAGE_NO');
  });

  it('returns 422 when stamina is insufficient', async () => {
    const handler = createPostStageBattleStart({
      resolveUserId: async () => 'user-1',
      startStageBattleSession: async () => {
        throw new StageBattleSessionError(
          'INSUFFICIENT_STAMINA',
          'Stamina insufficient: 1 / 10 required',
        );
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/start', { stageNo: 1 }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('INSUFFICIENT_STAMINA');
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createPostStageBattleStart({
      resolveUserId: async () => 'user-1',
      startStageBattleSession: async () => {
        throw new Error('should not be called');
      },
    });

    const response = await handler(
      new Request('http://localhost/api/v1/stage-battles/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_JSON');
  });

  it('returns 200 with session payload on success', async () => {
    const handler = createPostStageBattleStart({
      resolveUserId: async () => 'user-1',
      startStageBattleSession: async () => ({
        battleSessionId: 'session-1',
        expiresAt: '2026-04-24T12:00:00.000Z',
        stage: {
          stageNo: 1,
          stageName: 'S1',
          clearConditionType: 'defeat_boss',
          clearConditionParams: { target: 'boss' },
          stageCategory: 'normal',
        },
        labels: {
          stageLabel: 'S1',
          turnLabel: 'TURN 1',
          handLabel: '持ち駒',
        },
        board: {
          size: 9,
          placements: [],
        },
        enemyRoster: [],
        rewards: [],
      }),
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/start', {
        stageNo: 1,
        clientVersion: '1.2.3',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.battleSessionId).toBe('session-1');
    expect(payload.data.stage.stageNo).toBe(1);
  });
});
