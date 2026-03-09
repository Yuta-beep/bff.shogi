import { optionsDeck, getDeck, postDeck, deleteDeckHandler } from '@/server/handlers/v1/deck';

export const runtime = 'nodejs';

export const OPTIONS = optionsDeck;
export const GET = getDeck;
export const POST = postDeck;
export const DELETE = deleteDeckHandler;
