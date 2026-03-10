import { describe, expect, it } from 'bun:test';

import { getPieceShopCatalog } from '../shops/piece/catalog';
import { readJson } from './test-utils';

describe('GET /api/v1/shops/piece/catalog', () => {
  it('returns fixed envelope with items and currency', async () => {
    const response = await getPieceShopCatalog();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.items)).toBe(true);
    expect(payload.data).toHaveProperty('note', 'TEMP_MOCK_NO_CURRENCY_TABLE');
  });
});
