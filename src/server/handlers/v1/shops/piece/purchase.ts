import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { MOCK_SHOP_ITEMS } from '@/server/mocks/shop';
import { purchasePieceShopItem, type ShopItemKey } from '@/services/shop';

type PurchaseBody = {
  itemKey?: string;
  item?: {
    key?: string;
  };
};

export function optionsPieceShopPurchase() {
  return optionsResponse();
}

async function resolveUserId(req: Request): Promise<string | null> {
  return resolveBearerUserId(req);
}

function mapPurchaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'INSUFFICIENT_CURRENCY') {
    return jsonError('INSUFFICIENT_CURRENCY', '通貨が足りません', 400);
  }
  if (message === 'ALREADY_OWNED') {
    return jsonError('ALREADY_OWNED', 'すでに購入済みです', 409);
  }
  if (message === 'ITEM_NOT_FOUND' || message.startsWith('SHOP_PIECE_NOT_CONFIGURED')) {
    return jsonError('ITEM_NOT_FOUND', '商品が見つかりません', 404);
  }
  return jsonError('INTERNAL_ERROR', message, 500);
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

  const userId = await resolveUserId(req);
  if (!userId) {
    return jsonError('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const result = await purchasePieceShopItem(userId, requestedKey as ShopItemKey);
    return jsonOk(result);
  } catch (error: unknown) {
    return mapPurchaseError(error);
  }
}
