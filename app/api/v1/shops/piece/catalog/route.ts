import { getPieceShopCatalog, optionsPieceShopCatalog } from '@/server/handlers/v1/shops/piece/catalog';

export const runtime = 'nodejs';

export const OPTIONS = optionsPieceShopCatalog;
export const GET = getPieceShopCatalog;
