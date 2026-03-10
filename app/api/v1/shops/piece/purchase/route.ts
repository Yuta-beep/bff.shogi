import {
  optionsPieceShopPurchase,
  postPieceShopPurchase,
} from '@/server/handlers/v1/shops/piece/purchase';

export const runtime = 'nodejs';

export const OPTIONS = optionsPieceShopPurchase;
export const POST = postPieceShopPurchase;
