import { describe, expect, it } from 'bun:test';

import { postPieceShopPurchase } from '../shops/piece/purchase';
import { invalidJsonRequest, jsonRequest, readJson } from './test-utils';

describe('POST /api/v1/shops/piece/purchase', () => {
  it('returns INVALID_JSON for broken body', async () => {
    const response = await postPieceShopPurchase(
      invalidJsonRequest('http://localhost/api/v1/shops/piece/purchase'),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_JSON');
  });

  it('returns ITEM_NOT_FOUND for unknown key', async () => {
    const response = await postPieceShopPurchase(
      jsonRequest('http://localhost/api/v1/shops/piece/purchase', { itemKey: 'unknown' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('ITEM_NOT_FOUND');
  });
});
