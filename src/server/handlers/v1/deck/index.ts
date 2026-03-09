import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getDeckSnapshot, saveDeck, deleteDeck } from '@/services/deck';

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function optionsDeck() {
  return optionsResponse();
}

export async function getDeck(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const snapshot = await getDeckSnapshot(userId);
    return jsonOk(snapshot);
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load deck data', 500);
  }
}

type SaveDeckBody = {
  name?: string;
  placements?: { rowNo: number; colNo: number; pieceId: number }[];
};

export async function postDeck(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  let body: SaveDeckBody;
  try {
    body = (await req.json()) as SaveDeckBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  if (!body.name?.trim()) {
    return jsonError('INVALID_INPUT', 'name is required', 400);
  }
  if (!Array.isArray(body.placements)) {
    return jsonError('INVALID_INPUT', 'placements must be an array', 400);
  }

  try {
    const deckId = await saveDeck(userId, {
      name: body.name.trim(),
      placements: body.placements,
    });
    return jsonOk({ deckId });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to save deck', 500);
  }
}

export async function deleteDeckHandler(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  const url = new URL(req.url);
  const deckIdStr = url.searchParams.get('deckId');
  const deckId = deckIdStr ? parseInt(deckIdStr, 10) : NaN;

  if (isNaN(deckId)) {
    return jsonError('INVALID_INPUT', 'deckId query param is required', 400);
  }

  try {
    await deleteDeck(userId, deckId);
    return jsonOk({ deleted: true });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to delete deck', 500);
  }
}
