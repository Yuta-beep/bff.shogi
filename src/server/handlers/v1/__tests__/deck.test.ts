import { describe, expect, it } from 'bun:test';

import { createDeleteDeckHandler, createGetDeck, createPostDeck, createPutDeck } from '../deck';
import { invalidJsonRequest, jsonRequest, readJson } from './test-utils';

const baseDeps = {
  resolveUserId: async () => 'user-1',
  getDeckSnapshot: async () => ({ ownedPieces: [], decks: [] }),
  saveDeck: async () => 42,
  upsertDeck: async () => 7,
  deleteDeck: async () => {},
};

describe('/api/v1/deck', () => {
  it('GET returns 401 without auth', async () => {
    const handler = createGetDeck({ ...baseDeps, resolveUserId: async () => null });
    const response = await handler(new Request('http://localhost/api/v1/deck'));
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
  });

  it('POST validates JSON and returns deckId on success', async () => {
    const handler = createPostDeck(baseDeps);

    const bad = await handler(invalidJsonRequest('http://localhost/api/v1/deck'));
    const badPayload = await readJson(bad);
    expect(bad.status).toBe(400);
    expect(badPayload.error.code).toBe('INVALID_JSON');

    const ok = await handler(
      jsonRequest('http://localhost/api/v1/deck', {
        name: 'main',
        placements: [{ rowNo: 0, colNo: 0, pieceId: 1 }],
      }),
    );
    const okPayload = await readJson(ok);
    expect(ok.status).toBe(200);
    expect(okPayload).toEqual({ ok: true, data: { deckId: 42 } });
  });

  it('DELETE validates deckId query param', async () => {
    const handler = createDeleteDeckHandler(baseDeps);
    const bad = await handler(new Request('http://localhost/api/v1/deck'));
    const badPayload = await readJson(bad);
    expect(bad.status).toBe(400);
    expect(badPayload.error.code).toBe('INVALID_INPUT');

    const ok = await handler(new Request('http://localhost/api/v1/deck?deckId=7'));
    const okPayload = await readJson(ok);
    expect(ok.status).toBe(200);
    expect(okPayload).toEqual({ ok: true, data: { deleted: true } });
  });

  it('PUT validates payload and returns deckId on success', async () => {
    const handler = createPutDeck(baseDeps);

    const badJson = await handler(invalidJsonRequest('http://localhost/api/v1/deck'));
    const badJsonPayload = await readJson(badJson);
    expect(badJson.status).toBe(400);
    expect(badJsonPayload.error.code).toBe('INVALID_JSON');

    const badPlacement = await handler(
      jsonRequest('http://localhost/api/v1/deck', {
        name: 'マイデッキ',
        placements: [{ rowNo: 7, colNo: 0, pieceId: 1 }],
      }),
    );
    const badPlacementPayload = await readJson(badPlacement);
    expect(badPlacement.status).toBe(400);
    expect(badPlacementPayload.error.code).toBe('INVALID_INPUT');

    const ok = await handler(
      jsonRequest('http://localhost/api/v1/deck', {
        name: 'マイデッキ',
        placements: [{ rowNo: 2, colNo: 4, pieceId: 11 }],
      }),
    );
    const okPayload = await readJson(ok);
    expect(ok.status).toBe(200);
    expect(okPayload).toEqual({ ok: true, data: { deckId: 7 } });
  });
});
