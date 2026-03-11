import { getGachaLobbyHandler, optionsGacha } from '@/server/handlers/v1/gacha';

export const runtime = 'nodejs';

export const OPTIONS = optionsGacha;
export const GET = getGachaLobbyHandler;
