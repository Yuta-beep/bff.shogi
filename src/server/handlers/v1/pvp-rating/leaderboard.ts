import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { resolveUserId } from '@/server/handlers/v1/deck';
import {
  fetchPvpRatingLeaderboard,
  PVP_RATING_LEADERBOARD_DEFAULT_LIMIT,
  PVP_RATING_LEADERBOARD_MAX_LIMIT,
} from '@/services/pvp-rating';

export function optionsPvpRatingLeaderboard() {
  return optionsResponse();
}

type LeaderboardDeps = {
  resolveUserId: typeof resolveUserId;
  fetchPvpRatingLeaderboard: typeof fetchPvpRatingLeaderboard;
};

const defaultDeps: LeaderboardDeps = {
  resolveUserId,
  fetchPvpRatingLeaderboard,
};

function parseLimit(req: Request): number | 'invalid' {
  const raw = new URL(req.url).searchParams.get('limit');
  if (raw == null || raw.trim() === '') {
    return PVP_RATING_LEADERBOARD_DEFAULT_LIMIT;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > PVP_RATING_LEADERBOARD_MAX_LIMIT) {
    return 'invalid';
  }
  return limit;
}

export function createGetPvpRatingLeaderboard(deps: LeaderboardDeps = defaultDeps) {
  return async function getPvpRatingLeaderboard(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const limit = parseLimit(req);
    if (limit === 'invalid') {
      return jsonError(
        'INVALID_INPUT',
        `limit must be an integer between 1 and ${PVP_RATING_LEADERBOARD_MAX_LIMIT}`,
        400,
      );
    }

    try {
      const snapshot = await deps.fetchPvpRatingLeaderboard(limit);
      return jsonOk(snapshot);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load PvP rating leaderboard';
      return jsonError('INTERNAL_ERROR', message, 500);
    }
  };
}

export const getPvpRatingLeaderboardHandler = createGetPvpRatingLeaderboard();
