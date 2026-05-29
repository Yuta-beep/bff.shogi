import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import {
  getPieceShopCatalogForGuest,
  getPieceShopCatalog as loadPieceShopCatalog,
} from '@/services/shop';

export function optionsPieceShopCatalog() {
  return optionsResponse();
}

async function resolveUserId(req: Request): Promise<string | null> {
  return resolveBearerUserId(req);
}

export async function getPieceShopCatalog(req: Request) {
  const userId = await resolveUserId(req);

  try {
    if (!userId) {
      const guest = await getPieceShopCatalogForGuest();
      return jsonOk({
        ...guest,
        note: 'GUEST_ZERO_WALLET',
      });
    }

    const snapshot = await loadPieceShopCatalog(userId);
    return jsonOk({
      ...snapshot,
      note: 'PLAYER_WALLET',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load shop catalog';
    console.error('[shop/catalog]', message, error);
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
