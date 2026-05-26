import {
  optionsMePvpRatingApply,
  postMePvpRatingApply,
} from '@/server/handlers/v1/me/pvp-rating-apply';

export const runtime = 'nodejs';

export const OPTIONS = optionsMePvpRatingApply;
export const POST = postMePvpRatingApply;
