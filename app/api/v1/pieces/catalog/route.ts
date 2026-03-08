import { getPieceCatalog, optionsPieceCatalog } from '@/server/handlers/v1/pieces/catalog';

export const runtime = 'nodejs';

export const OPTIONS = optionsPieceCatalog;
export const GET = getPieceCatalog;
