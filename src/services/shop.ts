import { supabaseAdmin } from '@/lib/supabase-admin';
import { MOCK_SHOP_ITEMS } from '@/server/mocks/shop';
import {
  lookupShopPiecesInDb,
  resolveShopPieceId,
  type ShopItemKey,
} from '@/services/shop-master';

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
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('pawn_currency,gold_currency')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Player not found');
  return {
    pawnCurrency: toNumber((data as { pawn_currency?: unknown }).pawn_currency),
    goldCurrency: toNumber((data as { gold_currency?: unknown }).gold_currency),
  };
}

async function spendShopCost(
  userId: string,
  cost: { pawn: number; gold: number },
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const wallet = await getPlayerWallet(userId);
  if (wallet.pawnCurrency < cost.pawn || wallet.goldCurrency < cost.gold) {
    throw new Error('INSUFFICIENT_CURRENCY');
  }

  const nextPawn = wallet.pawnCurrency - cost.pawn;
  const nextGold = wallet.goldCurrency - cost.gold;
  const { error } = await supabaseAdmin
    .from('players')
    .update({
      pawn_currency: nextPawn,
      gold_currency: nextGold,
    })
    .eq('id', userId);
  if (error) throw error;
  return { pawnCurrency: nextPawn, goldCurrency: nextGold };
}

async function listOwnedShopKeys(userId: string): Promise<ShopItemKey[]> {
  const shopKanji = SHOP_ITEMS.map((item) => item.key);
  let pieceIdByKanji: Map<string, number>;
  try {
    pieceIdByKanji = await lookupShopPiecesInDb();
  } catch {
    return [];
  }

  const shopPieceIds = Array.from(pieceIdByKanji.values());
  if (shopPieceIds.length === 0) return [];

  const { data: ownedRows, error: ownedError } = await supabaseAdmin
    .from('player_owned_pieces')
    .select('piece_id')
    .eq('player_id', userId)
    .in('piece_id', shopPieceIds);
  if (ownedError) throw ownedError;

  const ownedIds = new Set(
    (ownedRows ?? []).map((row) => toNumber((row as { piece_id?: unknown }).piece_id)),
  );

  return shopKanji.filter((kanji) => {
    const pieceId = pieceIdByKanji.get(kanji);
    return pieceId !== undefined && ownedIds.has(pieceId);
  }) as ShopItemKey[];
}

async function grantShopOwnedPiece(
  userId: string,
  pieceId: number,
): Promise<{ alreadyOwned: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('player_owned_pieces')
    .select('quantity')
    .eq('player_id', userId)
    .eq('piece_id', pieceId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    return { alreadyOwned: true };
  }

  const { error: insertError } = await supabaseAdmin.from('player_owned_pieces').insert({
    player_id: userId,
    piece_id: pieceId,
    source: 'shop',
    quantity: 1,
    acquired_at: new Date().toISOString(),
  });
  if (insertError) throw insertError;
  return { alreadyOwned: false };
}

export async function getPieceShopCatalog(userId: string): Promise<PieceShopCatalogSnapshot> {
  const [wallet, owned] = await Promise.all([
    getPlayerWallet(userId),
    listOwnedShopKeys(userId),
  ]);

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

  const pieceId = await resolveShopPieceId(itemKey);
  const ownedBefore = await listOwnedShopKeys(userId);
  if (ownedBefore.includes(itemKey)) {
    throw new Error('ALREADY_OWNED');
  }

  const wallet = await spendShopCost(userId, {
    pawn: item.costType === 'pawn' ? item.cost : 0,
    gold: item.costType === 'gold' ? item.cost : 0,
  });

  const { alreadyOwned } = await grantShopOwnedPiece(userId, pieceId);
  if (alreadyOwned) {
    throw new Error('ALREADY_OWNED');
  }

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
