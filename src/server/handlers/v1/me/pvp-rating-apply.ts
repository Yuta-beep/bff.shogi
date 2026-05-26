import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyPvpRatingForUser } from '@/services/pvp-rating';

export function optionsMePvpRatingApply() {
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

type ApplyBody = {
  matchId?: string;
  won?: boolean;
};

export async function postMePvpRatingApply(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return jsonError('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
  if (!matchId) {
    return jsonError('INVALID_INPUT', 'matchId is required', 400);
  }
  if (typeof body.won !== 'boolean') {
    return jsonError('INVALID_INPUT', 'won must be a boolean', 400);
  }

  try {
    const result = await applyPvpRatingForUser({
      userId,
      matchId,
      won: body.won,
    });
    return jsonOk({
      rating: result.rating,
      delta: result.delta,
      alreadyApplied: result.alreadyApplied,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to apply PvP rating';
    if (message.includes('not found')) {
      return jsonError('PLAYER_NOT_FOUND', message, 404);
    }
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
