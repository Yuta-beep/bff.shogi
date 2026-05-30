import { supabaseAdmin } from '@/lib/supabase-admin';
import { measure } from '@/lib/perf';

export const PVP_RATING_INITIAL = 0;
export const PVP_RATING_WIN_DELTA = 50;
export const PVP_RATING_LOSS_DELTA = 30;

export type PvpRatingApplyResult = {
  rating: number;
  delta: number;
  alreadyApplied: boolean;
};

function normalizeRating(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return PVP_RATING_INITIAL;
  return Math.max(0, Math.floor(n));
}

export async function applyPvpRatingForUser(input: {
  userId: string;
  matchId: string;
  won: boolean;
}): Promise<PvpRatingApplyResult> {
  const matchId = input.matchId.trim();
  if (!matchId) {
    throw new Error('matchId is required');
  }

  const { data, error } = await measure(
    'players.applyPvpRatingForUser.rpc',
    () =>
      supabaseAdmin.rpc('apply_pvp_rating_for_user', {
        p_user_id: input.userId,
        p_match_id: matchId,
        p_won: input.won,
      }),
    { userId: input.userId, matchId, won: input.won },
  );

  if (error) throw error;

  const row = data as { rating?: unknown; delta?: unknown; already_applied?: unknown } | null;
  if (!row) {
    throw new Error('Failed to apply PvP rating');
  }

  return {
    rating: normalizeRating(row.rating),
    delta: Number(row.delta ?? 0),
    alreadyApplied: Boolean(row.already_applied),
  };
}

export const PVP_RATING_LEADERBOARD_DEFAULT_LIMIT = 20;
export const PVP_RATING_LEADERBOARD_MAX_LIMIT = 100;

export type PvpRatingLeaderboardEntry = {
  rank: number;
  playerId: string;
  displayName: string;
  rating: number;
};

export type PvpRatingLeaderboardSnapshot = {
  entries: PvpRatingLeaderboardEntry[];
  snapshotAt: string;
};

export async function fetchPvpRatingLeaderboard(
  limit: number = PVP_RATING_LEADERBOARD_DEFAULT_LIMIT,
): Promise<PvpRatingLeaderboardSnapshot> {
  const safeLimit = Math.min(PVP_RATING_LEADERBOARD_MAX_LIMIT, Math.max(1, Math.floor(limit)));

  const { data, error } = await measure(
    'players.fetchPvpRatingLeaderboard.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('id,display_name,rating')
        .order('rating', { ascending: false })
        .order('updated_at', { ascending: true })
        .limit(safeLimit),
    { limit: safeLimit },
  );

  if (error) throw error;

  const snapshotAt = new Date().toISOString();
  const entries = (data ?? []).map((row, index) => {
    const playerId = String(row.id ?? '').trim();
    const displayName = ((row.display_name as string | null) ?? '').trim() || playerId;
    return {
      rank: index + 1,
      playerId,
      displayName,
      rating: normalizeRating(row.rating),
    };
  });

  return { entries, snapshotAt };
}

export async function getPublicPlayerProfile(userId: string): Promise<{
  userId: string;
  displayName: string;
  rating: number;
} | null> {
  const { data, error } = await measure(
    'players.getPublicPlayerProfile.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('display_name,rating')
        .eq('id', userId)
        .limit(1)
        .maybeSingle(),
    { userId },
  );

  if (error) throw error;
  if (!data) return null;

  const displayName = ((data.display_name as string | null) ?? '').trim() || userId;
  return {
    userId,
    displayName,
    rating: normalizeRating(data.rating),
  };
}
