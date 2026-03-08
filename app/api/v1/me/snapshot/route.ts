import { getMeSnapshot, optionsMeSnapshot } from '@/server/handlers/v1/me/snapshot';

export const runtime = 'nodejs';

export const OPTIONS = optionsMeSnapshot;
export const GET = getMeSnapshot;
