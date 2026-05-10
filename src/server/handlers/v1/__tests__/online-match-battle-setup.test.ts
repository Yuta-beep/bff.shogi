import { describe, expect, it } from 'bun:test';

import {
  createGetBattleSetup,
  createPostBattleSetup,
  createPostBattleSetupLock,
  createPostBattleSetupValidate,
} from '../online-match/battle-setup';
import { jsonRequest, readJson } from './test-utils';

const deps = {
  resolveUserId: async () => 'user-1',
  saveBattleSetup: async (input: any) => ({
    battleSetupId: 'bsetup_1',
    status: 'draft',
    ...input,
  }),
  validateBattleSetup: async (_userId: string, battleSetupId: string) => ({
    battleSetupId,
    status: 'validated',
    validationSummary: { boardPieceCount: 1, handPieceCount: 0, totalSelectedPieces: 1 },
  }),
  getBattleSetup: async (_userId: string, battleSetupId: string) => ({
    battleSetupId,
    ownerUserId: 'user-1',
    status: 'validated',
    boardLayout: [],
    handsLayout: [],
    selectedPieceIds: [],
    validationSummary: { boardPieceCount: 0, handPieceCount: 0, totalSelectedPieces: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: null,
  }),
  lockBattleSetup: async (_userId: string, battleSetupId: string) => ({
    battleSetupId,
    status: 'locked',
  }),
};

describe('online match battle setup handlers', () => {
  it('creates a draft battle setup', async () => {
    const handler = createPostBattleSetup(deps as any);
    const response = await handler(
      jsonRequest('http://localhost/api/v1/online-match/battle-setup', {
        boardLayout: [{ row: 0, col: 0, pieceId: 1, pieceCode: 'FU' }],
        handsLayout: [],
        selectedPieceIds: [1],
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { battleSetupId: 'bsetup_1', status: 'draft' },
    });
  });

  it('validates a draft battle setup', async () => {
    const handler = createPostBattleSetupValidate(deps as any);
    const response = await handler(new Request('http://localhost'), {
      params: Promise.resolve({ battleSetupId: 'bsetup_1' }),
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe('validated');
  });

  it('gets a battle setup', async () => {
    const handler = createGetBattleSetup(deps as any);
    const response = await handler(new Request('http://localhost'), {
      params: Promise.resolve({ battleSetupId: 'bsetup_1' }),
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.battleSetupId).toBe('bsetup_1');
  });

  it('gets a battle setup for internal matching server requests', async () => {
    const handler = createGetBattleSetup({
      ...deps,
      resolveUserId: async () => {
        throw new Error('missing auth');
      },
      getBattleSetup: async (userId: string, battleSetupId: string) => ({
        battleSetupId,
        ownerUserId: userId,
        status: 'validated',
        boardLayout: [],
        handsLayout: [],
        selectedPieceIds: [],
        validationSummary: { boardPieceCount: 0, handPieceCount: 0, totalSelectedPieces: 0 },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        name: null,
      }),
    } as any);
    const response = await handler(
      new Request('http://localhost', {
        headers: {
          'x-internal-user-id': 'user-internal',
        },
      }),
      {
        params: Promise.resolve({ battleSetupId: 'bsetup_1' }),
      },
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.ownerUserId).toBe('user-internal');
  });

  it('locks a validated battle setup', async () => {
    const handler = createPostBattleSetupLock(deps as any);
    const response = await handler(new Request('http://localhost'), {
      params: Promise.resolve({ battleSetupId: 'bsetup_1' }),
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { battleSetupId: 'bsetup_1', status: 'locked' },
    });
  });
});
