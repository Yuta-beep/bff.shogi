import { isPublishedNow } from '@/lib/time';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorageAssetUrl } from '@/lib/storage-asset-url';

type GachaRow = {
  gacha_id: number;
  gacha_code: string;
  gacha_name: string;
  rarity_rate_n: number;
  rarity_rate_r: number;
  rarity_rate_sr: number;
  rarity_rate_ur: number;
  rarity_rate_ssr: number;
  pawn_cost: number;
  gold_cost: number;
  image_bucket: string | null;
  image_key: string | null;
  is_active: boolean;
  published_at: string | null;
  unpublished_at: string | null;
};

type GachaPieceJoinRow = {
  gacha_id: number;
  weight: number;
  m_piece:
    | {
        piece_id: number;
        kanji: string;
        name: string;
        rarity: string;
        image_bucket: string | null;
        image_key: string | null;
      }
    | {
        piece_id: number;
        kanji: string;
        name: string;
        rarity: string;
        image_bucket: string | null;
        image_key: string | null;
      }[]
    | null;
};

function toPieceRow(row: GachaPieceJoinRow): {
  piece_id: number;
  kanji: string;
  name: string;
  rarity: string;
  image_bucket: string | null;
  image_key: string | null;
} | null {
  if (Array.isArray(row.m_piece)) {
    return row.m_piece[0] ?? null;
  }
  return row.m_piece ?? null;
}

export type GachaLobbyBanner = {
  key: string;
  name: string;
  rareRateText: string;
  usesGold?: boolean;
  pawnCost: number;
  goldCost: number;
  imageSignedUrl: string | null;
};

export type GachaLobbySnapshot = {
  banners: GachaLobbyBanner[];
  pawnCurrency: number;
  goldCurrency: number;
  history: string[];
};

export type RollGachaResult =
  | {
      type: 'hit';
      piece: {
        char: string;
        name: string;
        rarity: string;
        description: string;
        imageSignedUrl: string | null;
      };
      alreadyOwned: boolean;
      pawnCurrency: number;
      goldCurrency: number;
    }
  | {
      type: 'miss';
      currency: 'pawn' | 'gold';
      amount: number;
      pawnCurrency: number;
      goldCurrency: number;
    };

type ActiveGacha = {
  gachaId: number;
  gachaCode: string;
  gachaName: string;
  rates: {
    N: number;
    R: number;
    SR: number;
    UR: number;
    SSR: number;
  };
  costs: {
    pawn: number;
    gold: number;
  };
  imageBucket: string | null;
  imageKey: string | null;
  pieces: Array<{
    pieceId: number;
    char: string;
    name: string;
    rarity: string;
    weight: number;
    imageBucket: string | null;
    imageKey: string | null;
  }>;
};

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickWeightedRandom<T>(items: T[], getWeight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, getWeight(item));
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatRareRateText(rates: ActiveGacha['rates']): string {
  return `R ${formatRatePercent(rates.R)} / SR ${formatRatePercent(rates.SR)} / UR ${formatRatePercent(rates.UR)} / SSR ${formatRatePercent(rates.SSR)}`;
}

function rollRarity(rates: ActiveGacha['rates']): 'N' | 'R' | 'SR' | 'UR' | 'SSR' {
  const pool = [
    { rarity: 'N' as const, rate: Math.max(0, rates.N) },
    { rarity: 'R' as const, rate: Math.max(0, rates.R) },
    { rarity: 'SR' as const, rate: Math.max(0, rates.SR) },
    { rarity: 'UR' as const, rate: Math.max(0, rates.UR) },
    { rarity: 'SSR' as const, rate: Math.max(0, rates.SSR) },
  ];
  return pickWeightedRandom(pool, (x) => x.rate).rarity;
}

async function createSignedUrl(bucket: string | null, key: string | null): Promise<string | null> {
  return getStorageAssetUrl(bucket, key, { signedUrlTtlSec: 60 * 60 });
}

async function loadActiveGachasWithPieces(): Promise<ActiveGacha[]> {
  const { data: gachaRows, error: gachaError } = await supabaseAdmin
    .schema('master')
    .from('m_gacha')
    .select(
      'gacha_id,gacha_code,gacha_name,rarity_rate_n,rarity_rate_r,rarity_rate_sr,rarity_rate_ur,rarity_rate_ssr,pawn_cost,gold_cost,image_bucket,image_key,is_active,published_at,unpublished_at',
    )
    .order('gacha_id', { ascending: true });
  if (gachaError) throw gachaError;

  const activeRows = ((gachaRows ?? []) as GachaRow[]).filter((row) => isPublishedNow(row));
  if (activeRows.length === 0) return [];

  const gachaIds = activeRows.map((row) => row.gacha_id);
  const { data: pieceRows, error: pieceError } = await supabaseAdmin
    .schema('master')
    .from('m_gacha_piece')
    .select('gacha_id,weight,m_piece:piece_id(piece_id,kanji,name,rarity,image_bucket,image_key)')
    .in('gacha_id', gachaIds)
    .eq('is_active', true);
  if (pieceError) throw pieceError;

  const pieceRowsByGacha = new Map<number, GachaPieceJoinRow[]>();
  for (const row of (pieceRows ?? []) as unknown as GachaPieceJoinRow[]) {
    const current = pieceRowsByGacha.get(row.gacha_id) ?? [];
    current.push(row);
    pieceRowsByGacha.set(row.gacha_id, current);
  }

  return activeRows.map((row) => ({
    gachaId: row.gacha_id,
    gachaCode: row.gacha_code,
    gachaName: row.gacha_name,
    rates: {
      N: toNumber(row.rarity_rate_n),
      R: toNumber(row.rarity_rate_r),
      SR: toNumber(row.rarity_rate_sr),
      UR: toNumber(row.rarity_rate_ur),
      SSR: toNumber(row.rarity_rate_ssr),
    },
    costs: {
      pawn: toNumber((row as any).pawn_cost),
      gold: toNumber((row as any).gold_cost),
    },
    imageBucket: row.image_bucket,
    imageKey: row.image_key,
    pieces: (pieceRowsByGacha.get(row.gacha_id) ?? [])
      .map((r) => ({ row: r, piece: toPieceRow(r) }))
      .filter((r) => r.piece != null)
      .map((r) => ({
        pieceId: r.piece!.piece_id,
        char: r.piece!.kanji,
        name: r.piece!.name,
        rarity: r.piece!.rarity ?? 'N',
        weight: toNumber(r.row.weight, 1),
        imageBucket: r.piece!.image_bucket,
        imageKey: r.piece!.image_key,
      })),
  }));
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
    pawnCurrency: toNumber((data as any).pawn_currency),
    goldCurrency: toNumber((data as any).gold_currency),
  };
}

export async function getGachaLobby(userId: string): Promise<GachaLobbySnapshot> {
  const [wallet, gachas] = await Promise.all([
    getPlayerWallet(userId),
    loadActiveGachasWithPieces(),
  ]);

  const banners: GachaLobbyBanner[] = [];
  for (const gacha of gachas) {
    const imageSignedUrl = await createSignedUrl(gacha.imageBucket, gacha.imageKey);
    banners.push({
      key: gacha.gachaCode,
      name: gacha.gachaName,
      rareRateText: formatRareRateText(gacha.rates),
      usesGold: gacha.costs.gold > 0,
      pawnCost: gacha.costs.pawn,
      goldCost: gacha.costs.gold,
      imageSignedUrl,
    });
  }

  return {
    banners,
    pawnCurrency: wallet.pawnCurrency,
    goldCurrency: wallet.goldCurrency,
    history: [],
  };
}

async function addPlayerCurrency(
  userId: string,
  delta: { pawn?: number; gold?: number },
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const wallet = await getPlayerWallet(userId);
  const nextPawn = Math.max(0, wallet.pawnCurrency + (delta.pawn ?? 0));
  const nextGold = Math.max(0, wallet.goldCurrency + (delta.gold ?? 0));

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

async function spendGachaCost(
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

async function grantOwnedPiece(
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

  if (!data) {
    const { error: insertError } = await supabaseAdmin.from('player_owned_pieces').insert({
      player_id: userId,
      piece_id: pieceId,
      source: 'gacha',
      quantity: 1,
      acquired_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    return { alreadyOwned: false };
  }

  const nextQty = toNumber((data as any).quantity, 1) + 1;
  const { error: updateError } = await supabaseAdmin
    .from('player_owned_pieces')
    .update({
      quantity: nextQty,
      source: 'gacha',
      acquired_at: new Date().toISOString(),
    })
    .eq('player_id', userId)
    .eq('piece_id', pieceId);
  if (updateError) throw updateError;
  return { alreadyOwned: true };
}

export async function rollGacha(userId: string, gachaCode: string): Promise<RollGachaResult> {
  const gacha = (await loadActiveGachasWithPieces()).find((x) => x.gachaCode === gachaCode);
  if (!gacha) throw new Error('Gacha not found or unavailable');
  if (gacha.pieces.length === 0) throw new Error('No pieces configured for gacha');
  await spendGachaCost(userId, { pawn: gacha.costs.pawn, gold: gacha.costs.gold });

  const rarity = rollRarity(gacha.rates);
  if (rarity === 'N') {
    const wallet = await addPlayerCurrency(userId, { pawn: 1, gold: 0 });
    return {
      type: 'miss',
      currency: 'pawn',
      amount: 1,
      pawnCurrency: wallet.pawnCurrency,
      goldCurrency: wallet.goldCurrency,
    };
  }

  const candidates = gacha.pieces.filter((piece) => piece.rarity === rarity);
  const pool = candidates.length > 0 ? candidates : gacha.pieces;
  const picked = pickWeightedRandom(pool, (item) => item.weight);

  const [{ alreadyOwned }, wallet, imageSignedUrl] = await Promise.all([
    grantOwnedPiece(userId, picked.pieceId),
    getPlayerWallet(userId),
    createSignedUrl(picked.imageBucket, picked.imageKey),
  ]);

  return {
    type: 'hit',
    piece: {
      char: picked.char,
      name: picked.name,
      rarity: picked.rarity,
      description: `${picked.name}を獲得しました。`,
      imageSignedUrl,
    },
    alreadyOwned,
    pawnCurrency: wallet.pawnCurrency,
    goldCurrency: wallet.goldCurrency,
  };
}
