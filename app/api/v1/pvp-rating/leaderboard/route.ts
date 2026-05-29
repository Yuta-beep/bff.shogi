import {
  getPvpRatingLeaderboardHandler,
  optionsPvpRatingLeaderboard,
} from '@/server/handlers/v1/pvp-rating/leaderboard';

export const runtime = 'nodejs';

export const OPTIONS = optionsPvpRatingLeaderboard;
export const GET = getPvpRatingLeaderboardHandler;
