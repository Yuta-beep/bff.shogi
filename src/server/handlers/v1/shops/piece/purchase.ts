import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { MOCK_SHOP_ITEMS } from '@/server/mocks/shop';

type PurchaseBody = {
  itemKey?: string;
  item?: {
    key?: string;
  };
};

export function optionsPieceShopPurchase() {
  return optionsResponse();
}

export async function postPieceShopPurchase(req: Request) {
  let body: PurchaseBody;
  try {
    body = (await req.json()) as PurchaseBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const requestedKey = body.itemKey ?? body.item?.key;
  if (!requestedKey) {
    return jsonError('INVALID_ITEM_KEY', 'itemKey is required', 400);
  }

  const exists = MOCK_SHOP_ITEMS.some((item) => item.key === requestedKey);
  if (!exists) {
    return jsonError('ITEM_NOT_FOUND', `Unknown shop item: ${requestedKey}`, 404);
  }

  return jsonOk({
    success: false,
    reason: 'UI_ONLY' as const,
    note: 'TEMP_MOCK_NO_CURRENCY_OR_OWNERSHIP_TABLE'
  });
}
