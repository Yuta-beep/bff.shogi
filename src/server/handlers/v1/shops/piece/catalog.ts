import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getPieceShopCatalogForGuest,
  getPieceShopCatalog as loadPieceShopCatalog,
} from '@/services/shop';

export function optionsPieceShopCatalog() {
  return optionsResponse();
}

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function getPieceShopCatalog(req: Request = new Request('http://localhost')) {
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
    const message =
      error instanceof Error ? error.message : 'Failed to load shop catalog';
    console.error('[shop/catalog]', message, error);
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
