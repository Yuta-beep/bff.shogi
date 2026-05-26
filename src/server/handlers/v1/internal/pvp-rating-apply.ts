import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { applyPvpRatingForUser } from '@/services/pvp-rating';

export function optionsInternalPvpRatingApply() {
  return optionsResponse();
}

function isAuthorizedInternal(req: Request): boolean {
  const expected = (process.env.MATCHING_BFF_INTERNAL_TOKEN ?? '').trim();
  if (!expected) return false;
  const token = (req.headers.get('x-matching-internal-token') ?? '').trim();
  return token.length > 0 && token === expected;
}

type ApplyBody = {
  userId?: string;
  matchId?: string;
  won?: boolean;
};

export async function postInternalPvpRatingApply(req: Request) {
  if (!isAuthorizedInternal(req)) {
    return jsonError('UNAUTHORIZED', 'Invalid internal token', 401);
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
  if (!userId) {
    return jsonError('INVALID_INPUT', 'userId is required', 400);
  }
  if (!matchId) {
    return jsonError('INVALID_INPUT', 'matchId is required', 400);
  }
  if (typeof body.won !== 'boolean') {
    return jsonError('INVALID_INPUT', 'won must be a boolean', 400);
  }

  try {
    const result = await applyPvpRatingForUser({ userId, matchId, won: body.won });
    return jsonOk({
      userId,
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
