import { jsonOk, optionsResponse } from '@/lib/http';
import { MOCK_SHOP_CURRENCY, MOCK_SHOP_ITEMS, MOCK_SHOP_OWNED } from '@/server/mocks/shop';

export function optionsPieceShopCatalog() {
  return optionsResponse();
}

export async function getPieceShopCatalog() {
  return jsonOk({
    items: MOCK_SHOP_ITEMS,
    ...MOCK_SHOP_CURRENCY,
    owned: MOCK_SHOP_OWNED,
    note: 'TEMP_MOCK_NO_CURRENCY_TABLE'
  });
}
