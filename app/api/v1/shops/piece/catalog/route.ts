import { jsonOk, optionsResponse } from '@/lib/http';
import { MOCK_SHOP_CURRENCY, MOCK_SHOP_ITEMS, MOCK_SHOP_OWNED } from '@/api/shop-mock';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  return jsonOk({
    items: MOCK_SHOP_ITEMS,
    ...MOCK_SHOP_CURRENCY,
    owned: MOCK_SHOP_OWNED,
    note: 'TEMP_MOCK_NO_CURRENCY_TABLE',
  });
}
