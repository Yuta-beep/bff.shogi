import { describe, expect, it } from 'bun:test';

import { createGetMeDisplayName, createPutMeDisplayName } from '../me/display-name';
import { jsonRequest, readJson } from './test-utils';

describe('GET /api/v1/me/display-name', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createGetMeDisplayName({
      resolveUserId: async () => null,
      getPlayerDisplayName: async () => null,
    });

    const response = await handler(new Request('http://localhost/api/v1/me/display-name'));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns current display name', async () => {
    const handler = createGetMeDisplayName({
      resolveUserId: async () => 'user-1',
      getPlayerDisplayName: async () => '将棋太郎',
    });

    const response = await handler(new Request('http://localhost/api/v1/me/display-name'));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { displayName: '将棋太郎' },
    });
  });
});

describe('PUT /api/v1/me/display-name', () => {
  it('returns 400 for invalid input', async () => {
    const handler = createPutMeDisplayName({
      resolveUserId: async () => 'user-1',
      upsertPlayerDisplayName: async () => {},
    });

    const response = await handler(
      jsonRequest('http://localhost/api/v1/me/display-name', { displayName: '   ' }, 'PUT'),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'displayName is required' },
    });
  });

  it('upserts trimmed display name', async () => {
    let captured: { userId?: string; displayName?: string } = {};

    const handler = createPutMeDisplayName({
      resolveUserId: async () => 'user-1',
      upsertPlayerDisplayName: async (userId, displayName) => {
        captured = { userId, displayName };
      },
    });

    const response = await handler(
      jsonRequest(
        'http://localhost/api/v1/me/display-name',
        { displayName: '  新プレイヤー  ' },
        'PUT',
      ),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(captured).toEqual({ userId: 'user-1', displayName: '新プレイヤー' });
    expect(payload).toEqual({
      ok: true,
      data: { displayName: '新プレイヤー' },
    });
  });
});
