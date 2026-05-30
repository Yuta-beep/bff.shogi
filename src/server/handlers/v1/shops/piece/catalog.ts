import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { measure } from '@/lib/perf';
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
  return measure('request.GET /api/v1/shops/piece/catalog', async () => {
    const userId = await measure('request.shopCatalog.resolveUserId', () => resolveUserId(req));

    try {
      if (!userId) {
        const guest = await measure('request.shopCatalog.getGuestCatalog', () =>
          getPieceShopCatalogForGuest(),
        );
        return jsonOk({
          ...guest,
          note: 'GUEST_ZERO_WALLET',
        });
      }

      const snapshot = await measure(
        'request.shopCatalog.getPlayerCatalog',
        () => loadPieceShopCatalog(userId),
        { userId },
      );
      return jsonOk({
        ...snapshot,
        note: 'PLAYER_WALLET',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load shop catalog';
      console.error('[shop/catalog]', message, error);
      return jsonError('INTERNAL_ERROR', message, 500);
    }
  });
}
