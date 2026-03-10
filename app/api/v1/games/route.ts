import { optionsCreateGame, postCreateGame } from '@/server/handlers/v1/games/create';

export const runtime = 'nodejs';

export const OPTIONS = optionsCreateGame;
export const POST = postCreateGame;
