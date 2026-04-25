import { describe, expect, it } from 'bun:test';

import { createPostStageBattleFinish } from '../stage-battles/finish';
import { jsonRequest, readJson } from './test-utils';
import { StageBattleSessionError } from '@/services/stage-battle-session';

describe('POST /api/v1/stage-battles/finish', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createPostStageBattleFinish({
      resolveUserId: async () => null,
      finishStageBattleSession: async () => {
        throw new Error('should not be called');
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/finish', {
        battleSessionId: 'session-1',
        result: 'failed',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when result is invalid', async () => {
    const handler = createPostStageBattleFinish({
      resolveUserId: async () => 'user-1',
      finishStageBattleSession: async () => {
        throw new StageBattleSessionError(
          'INVALID_RESULT',
          'result must be one of cleared, failed',
        );
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/finish', {
        battleSessionId: 'session-1',
        result: 'unknown',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_RESULT');
  });

  it('returns 409 when session is expired', async () => {
    const handler = createPostStageBattleFinish({
      resolveUserId: async () => 'user-1',
      finishStageBattleSession: async () => {
        throw new StageBattleSessionError('SESSION_EXPIRED', 'stage battle session expired');
      },
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/finish', {
        battleSessionId: 'session-1',
        result: 'failed',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('SESSION_EXPIRED');
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createPostStageBattleFinish({
      resolveUserId: async () => 'user-1',
      finishStageBattleSession: async () => {
        throw new Error('should not be called');
      },
    });

    const response = await handler(
      new Request('http://localhost/api/v1/stage-battles/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_JSON');
  });

  it('returns 200 with finish payload on success', async () => {
    const handler = createPostStageBattleFinish({
      resolveUserId: async () => 'user-1',
      finishStageBattleSession: async () => ({
        battleSessionId: 'session-1',
        status: 'finished',
        result: 'cleared',
        stageNo: 1,
        clearApplied: true,
        firstClear: true,
        clearCount: 1,
        granted: {
          pawn: 10,
          gold: 2,
          pieces: [{ pieceId: 100, char: '忍', name: '忍', quantity: 1 }],
        },
        wallet: {
          pawnCurrency: 10,
          goldCurrency: 2,
        },
      }),
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/stage-battles/finish', {
        battleSessionId: 'session-1',
        result: 'cleared',
        finalSnapshotHash: 'abc123',
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.result).toBe('cleared');
    expect(payload.data.granted.pawn).toBe(10);
  });
});
