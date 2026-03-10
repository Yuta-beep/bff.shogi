import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deleteDeck, getDeckSnapshot, saveDeck, upsertDeck } from '@/services/deck';

export async function resolveUserId(req: Request): Promise<string | null> {
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

type DeckDeps = {
  resolveUserId: typeof resolveUserId;
  getDeckSnapshot: typeof getDeckSnapshot;
  saveDeck: typeof saveDeck;
  upsertDeck: typeof upsertDeck;
  deleteDeck: typeof deleteDeck;
};

const defaultDeckDeps: DeckDeps = {
  resolveUserId,
  getDeckSnapshot,
  saveDeck,
  upsertDeck,
  deleteDeck,
};

export function createGetDeck(deps: DeckDeps = defaultDeckDeps) {
  return async function getDeck(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

    try {
      const snapshot = await deps.getDeckSnapshot(userId);
      return jsonOk(snapshot);
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load deck data', 500);
    }
  };
}

type SaveDeckBody = {
  name?: string;
  placements?: { rowNo: number; colNo: number; pieceId: number }[];
};

function isValidPlacement(
  placement: unknown,
): placement is { rowNo: number; colNo: number; pieceId: number } {
  if (!placement || typeof placement !== 'object') return false;
  const target = placement as { rowNo?: unknown; colNo?: unknown; pieceId?: unknown };

  const isRowValid =
    typeof target.rowNo === 'number' &&
    Number.isInteger(target.rowNo) &&
    target.rowNo >= 0 &&
    target.rowNo <= 2;
  const isColValid =
    typeof target.colNo === 'number' &&
    Number.isInteger(target.colNo) &&
    target.colNo >= 0 &&
    target.colNo <= 8;
  const isPieceValid =
    typeof target.pieceId === 'number' && Number.isInteger(target.pieceId) && target.pieceId > 0;

  return isRowValid && isColValid && isPieceValid;
}

function parseSaveDeckBody(body: SaveDeckBody) {
  if (!body.name?.trim()) {
    return { ok: false as const, error: jsonError('INVALID_INPUT', 'name is required', 400) };
  }
  if (!Array.isArray(body.placements)) {
    return {
      ok: false as const,
      error: jsonError('INVALID_INPUT', 'placements must be an array', 400),
    };
  }
  if (!body.placements.every((placement) => isValidPlacement(placement))) {
    return {
      ok: false as const,
      error: jsonError(
        'INVALID_INPUT',
        'placements must contain valid rowNo(0..2), colNo(0..8), pieceId',
        400,
      ),
    };
  }

  return {
    ok: true as const,
    value: {
      name: body.name.trim(),
      placements: body.placements,
    },
  };
}

export function createPostDeck(deps: DeckDeps = defaultDeckDeps) {
  return async function postDeck(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

    let body: SaveDeckBody;
    try {
      body = (await req.json()) as SaveDeckBody;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
    }

    const parsed = parseSaveDeckBody(body);
    if (!parsed.ok) return parsed.error;

    try {
      const deckId = await deps.saveDeck(userId, parsed.value);
      return jsonOk({ deckId });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to save deck', 500);
    }
  };
}

export function createPutDeck(deps: DeckDeps = defaultDeckDeps) {
  return async function putDeck(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

    let body: SaveDeckBody;
    try {
      body = (await req.json()) as SaveDeckBody;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
    }

    const parsed = parseSaveDeckBody(body);
    if (!parsed.ok) return parsed.error;

    try {
      const deckId = await deps.upsertDeck(userId, parsed.value);
      return jsonOk({ deckId });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to upsert deck', 500);
    }
  };
}

export function createDeleteDeckHandler(deps: DeckDeps = defaultDeckDeps) {
  return async function deleteDeckHandler(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

    const url = new URL(req.url);
    const deckIdStr = url.searchParams.get('deckId');
    const deckId = deckIdStr ? parseInt(deckIdStr, 10) : NaN;

    if (isNaN(deckId)) {
      return jsonError('INVALID_INPUT', 'deckId query param is required', 400);
    }

    try {
      await deps.deleteDeck(userId, deckId);
      return jsonOk({ deleted: true });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to delete deck', 500);
    }
  };
}

export const getDeck = createGetDeck();
export const postDeck = createPostDeck();
export const putDeck = createPutDeck();
export const deleteDeckHandler = createDeleteDeckHandler();
