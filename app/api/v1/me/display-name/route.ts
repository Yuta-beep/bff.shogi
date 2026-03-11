import {
  getMeDisplayName,
  optionsMeDisplayName,
  putMeDisplayName,
} from '@/server/handlers/v1/me/display-name';

export const runtime = 'nodejs';

export const OPTIONS = optionsMeDisplayName;
export const GET = getMeDisplayName;
export const PUT = putMeDisplayName;
