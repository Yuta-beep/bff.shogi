import { supabaseAdmin } from '@/lib/supabase-admin';
import { measure } from '@/lib/perf';
import { MOCK_SHOP_ITEMS } from '@/server/mocks/shop';
import { lookupShopPiecesInDb, resolveShopPieceId, type ShopItemKey } from '@/services/shop-master';

export type { ShopItemKey };
export type ShopCostType = 'pawn' | 'gold';

export type ShopCatalogItem = {
  key: ShopItemKey;
  desc: string;
  move: string;
  cost: number;
  costType: ShopCostType;
};

export type PieceShopCatalogSnapshot = {
  items: ShopCatalogItem[];
  pawnCurrency: number;
  goldCurrency: number;
  owned: ShopItemKey[];
};

export type PurchasePieceShopResult = {
  success: true;
  itemKey: ShopItemKey;
  pawnCurrency: number;
  goldCurrency: number;
  owned: ShopItemKey[];
  grantedPieceId: number;
  alreadyOwned: boolean;
};

const SHOP_ITEMS: ShopCatalogItem[] = MOCK_SHOP_ITEMS.map((item) => ({ ...item }));

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Math.trunc(n);
}

async function getPlayerWallet(
  userId: string,
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const { data, error } = await measure(
    'shop.getPlayerWallet.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('pawn_currency,gold_currency')
        .eq('id', userId)
        .limit(1)
        .maybeSingle(),
    { userId },
  );
  if (error) throw error;
  if (!data) throw new Error('Player not found');
  return {
    pawnCurrency: toNumber((data as { pawn_currency?: unknown }).pawn_currency),
    goldCurrency: toNumber((data as { gold_currency?: unknown }).gold_currency),
  };
}

async function listOwnedShopKeys(userId: string): Promise<ShopItemKey[]> {
  const shopKanji = SHOP_ITEMS.map((item) => item.key);
  let pieceIdByKanji: Map<string, number>;
  try {
    pieceIdByKanji = await measure('shop.lookupShopPiecesInDb', () => lookupShopPiecesInDb());
  } catch {
    return [];
  }

  const shopPieceIds = Array.from(pieceIdByKanji.values());
  if (shopPieceIds.length === 0) return [];

  const { data: ownedRows, error: ownedError } = await measure(
    'shop.listOwnedShopKeys.query',
    () =>
      supabaseAdmin
        .from('player_owned_pieces')
        .select('piece_id')
        .eq('player_id', userId)
        .in('piece_id', shopPieceIds),
    { userId, pieceCount: shopPieceIds.length },
  );
  if (ownedError) throw ownedError;

  const ownedIds = new Set(
    (ownedRows ?? []).map((row) => toNumber((row as { piece_id?: unknown }).piece_id)),
  );

  return shopKanji.filter((kanji) => {
    const pieceId = pieceIdByKanji.get(kanji);
    return pieceId !== undefined && ownedIds.has(pieceId);
  }) as ShopItemKey[];
}

export async function getPieceShopCatalog(userId: string): Promise<PieceShopCatalogSnapshot> {
  const [wallet, owned] = await measure(
    'shop.getPieceShopCatalog.parallel',
    () => Promise.all([getPlayerWallet(userId), listOwnedShopKeys(userId)]),
    { userId },
  );

  return {
    items: SHOP_ITEMS,
    pawnCurrency: wallet.pawnCurrency,
    goldCurrency: wallet.goldCurrency,
    owned,
  };
}

export async function getPieceShopCatalogForGuest(): Promise<PieceShopCatalogSnapshot> {
  return {
    items: SHOP_ITEMS,
    pawnCurrency: 0,
    goldCurrency: 0,
    owned: [],
  };
}

export async function purchasePieceShopItem(
  userId: string,
  itemKey: ShopItemKey,
): Promise<PurchasePieceShopResult> {
  const item = SHOP_ITEMS.find((entry) => entry.key === itemKey);
  if (!item) throw new Error('ITEM_NOT_FOUND');

  const pieceId = await measure('shop.resolveShopPieceId', () => resolveShopPieceId(itemKey), {
    itemKey,
  });
  const { data, error } = await measure(
    'shop.purchasePieceShopItem.rpc',
    () =>
      supabaseAdmin.rpc('purchase_shop_piece_item', {
        p_user_id: userId,
        p_piece_id: pieceId,
        p_pawn_cost: item.costType === 'pawn' ? item.cost : 0,
        p_gold_cost: item.costType === 'gold' ? item.cost : 0,
      }),
    { userId, itemKey, pieceId },
  );
  if (error) throw error;

  const row = data as {
    pawn_currency?: unknown;
    gold_currency?: unknown;
    already_owned?: unknown;
  } | null;
  if (!row) {
    throw new Error('Failed to purchase piece');
  }

  const alreadyOwned = Boolean(row.already_owned);
  if (alreadyOwned) {
    throw new Error('ALREADY_OWNED');
  }

  const wallet = {
    pawnCurrency: toNumber(row.pawn_currency),
    goldCurrency: toNumber(row.gold_currency),
  };
  const owned = await listOwnedShopKeys(userId);

  return {
    success: true,
    itemKey,
    pawnCurrency: wallet.pawnCurrency,
    goldCurrency: wallet.goldCurrency,
    owned,
    grantedPieceId: pieceId,
    alreadyOwned: false,
  };
}
