import {
  optionsInternalPvpRatingApply,
  postInternalPvpRatingApply,
} from '@/server/handlers/v1/internal/pvp-rating-apply';

export const runtime = 'nodejs';

export const OPTIONS = optionsInternalPvpRatingApply;
export const POST = postInternalPvpRatingApply;
