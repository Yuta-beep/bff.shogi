import { optionsGacha, postGachaRollHandler } from '@/server/handlers/v1/gacha';

export const runtime = 'nodejs';

export const OPTIONS = optionsGacha;
export const POST = postGachaRollHandler;
