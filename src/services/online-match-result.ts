import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyPvpRatingForUser } from '@/services/pvp-rating';

export type OnlineMatchResultInput = {
  matchId: string;
  playerBlackUserId: string;
  playerWhiteUserId: string;
  winnerUserId: string | null;
  status: 'finished' | 'aborted';
  reason: string;
  startedAt: string;
  finishedAt: string;
};

export async function recordOnlineMatchResult(input: OnlineMatchResultInput) {
  const matchId = input.matchId.trim();
  if (!matchId) throw new Error('matchId is required');

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('online_match_results')
    .select('*')
    .eq('match_id', matchId)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { alreadyRecorded: true, ratingResults: [] };
  }

  const { error: insertError } = await supabaseAdmin.from('online_match_results').insert({
    match_id: matchId,
    player_black_user_id: input.playerBlackUserId,
    player_white_user_id: input.playerWhiteUserId,
    winner_user_id: input.winnerUserId,
    status: input.status,
    reason: input.reason,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return { alreadyRecorded: true, ratingResults: [] };
    }
    throw insertError;
  }

  const shouldRate = input.status === 'finished' && Boolean(input.winnerUserId);
  if (!shouldRate) return { alreadyRecorded: false, ratingResults: [] };

  const players = [input.playerBlackUserId, input.playerWhiteUserId];
  const ratingResults = await Promise.all(
    players.map((userId) =>
      applyPvpRatingForUser({
        userId,
        matchId,
        won: userId === input.winnerUserId,
      }).then((result) => ({ userId, ...result })),
    ),
  );

  return { alreadyRecorded: false, ratingResults };
}
