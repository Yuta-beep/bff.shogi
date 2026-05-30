import { getActiveDeckSummary, optionsDeck } from '@/server/handlers/v1/deck';

export const runtime = 'nodejs';

export const OPTIONS = optionsDeck;
export const GET = getActiveDeckSummary;
