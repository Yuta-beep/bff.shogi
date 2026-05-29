import { supabaseAdmin } from '@/lib/supabase-admin';

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

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('player_pvp_rating_events')
    .select('delta,rating_after')
    .eq('player_id', input.userId)
    .eq('match_id', matchId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return {
      rating: normalizeRating(existing.rating_after),
      delta: Number(existing.delta ?? 0),
      alreadyApplied: true,
    };
  }

  const { data: player, error: playerError } = await supabaseAdmin
    .from('players')
    .select('rating')
    .eq('id', input.userId)
    .limit(1)
    .maybeSingle();

  if (playerError) throw playerError;
  if (!player) {
    throw new Error('Player profile not found');
  }

  const current = normalizeRating(player.rating);
  const delta = input.won ? PVP_RATING_WIN_DELTA : -PVP_RATING_LOSS_DELTA;
  const nextRating = Math.max(0, current + delta);

  const { error: updateError } = await supabaseAdmin
    .from('players')
    .update({ rating: nextRating, updated_at: new Date().toISOString() })
    .eq('id', input.userId);

  if (updateError) throw updateError;

  const { error: insertError } = await supabaseAdmin.from('player_pvp_rating_events').insert({
    player_id: input.userId,
    match_id: matchId,
    won: input.won,
    delta,
    rating_after: nextRating,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('player_pvp_rating_events')
        .select('delta,rating_after')
        .eq('player_id', input.userId)
        .eq('match_id', matchId)
        .limit(1)
        .maybeSingle();
      if (raced) {
        return {
          rating: normalizeRating(raced.rating_after),
          delta: Number(raced.delta ?? 0),
          alreadyApplied: true,
        };
      }
    }
    throw insertError;
  }

  return { rating: nextRating, delta, alreadyApplied: false };
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

  const { data, error } = await supabaseAdmin
    .from('players')
    .select('id,display_name,rating')
    .order('rating', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(safeLimit);

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
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('display_name,rating')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const displayName = ((data.display_name as string | null) ?? '').trim() || userId;
  return {
    userId,
    displayName,
    rating: normalizeRating(data.rating),
  };
}
