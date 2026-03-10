import { supabaseAdmin } from '@/lib/supabase-admin';

export type OwnedPieceRow = {
  pieceId: number;
  char: string;
  name: string;
  imageSignedUrl: string | null;
  quantity: number;
  acquiredAt: string;
  source: string;
};

export type DeckPlacement = {
  rowNo: number;
  colNo: number;
  pieceId: number;
  char: string;
  name: string;
  imageSignedUrl: string | null;
};

export type DeckRow = {
  deckId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  placements: DeckPlacement[];
};

export type DeckSnapshot = {
  ownedPieces: OwnedPieceRow[];
  decks: DeckRow[];
};

export async function getDeckSnapshot(userId: string): Promise<DeckSnapshot> {
  const [ownedRes, decksRes] = await Promise.all([
    supabaseAdmin
      .from('player_owned_pieces')
      .select('piece_id, quantity, acquired_at, source')
      .eq('player_id', userId)
      .order('acquired_at', { ascending: true }),

    supabaseAdmin
      .from('player_decks')
      .select(
        'deck_id, name, created_at, updated_at, player_deck_placements(row_no, col_no, piece_id)',
      )
      .eq('player_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (ownedRes.error) throw ownedRes.error;
  if (decksRes.error) throw decksRes.error;

  const ownedRows = (ownedRes.data ?? []) as Array<{
    piece_id: number;
    quantity: number;
    acquired_at: string;
    source: string;
  }>;
  const deckRows = (decksRes.data ?? []) as Array<{
    deck_id: number;
    name: string;
    created_at: string;
    updated_at: string;
    player_deck_placements?: Array<{ row_no: number; col_no: number; piece_id: number }>;
  }>;

  const pieceIds = new Set<number>();
  for (const row of ownedRows) pieceIds.add(row.piece_id);
  for (const deck of deckRows) {
    for (const placement of deck.player_deck_placements ?? []) {
      pieceIds.add(placement.piece_id);
    }
  }

  const pieceById = new Map<
    number,
    { kanji: string; name: string; imageBucket: string | null; imageKey: string | null }
  >();
  if (pieceIds.size > 0) {
    const { data: pieceRows, error: pieceError } = await supabaseAdmin
      .schema('master')
      .from('m_piece')
      .select('piece_id, kanji, name, image_bucket, image_key')
      .in('piece_id', Array.from(pieceIds));

    if (pieceError) throw pieceError;

    for (const piece of pieceRows ?? []) {
      pieceById.set(piece.piece_id as number, {
        kanji: (piece.kanji as string) ?? '',
        name: (piece.name as string) ?? '',
        imageBucket: (piece.image_bucket as string | null) ?? null,
        imageKey: (piece.image_key as string | null) ?? null,
      });
    }
  }

  const storageUrlByAsset = new Map<string, string | null>();
  const signedUrlTtlSec = 60 * 60;
  for (const meta of pieceById.values()) {
    if (!meta.imageBucket || !meta.imageKey) continue;
    const assetKey = `${meta.imageBucket}::${meta.imageKey}`;
    if (storageUrlByAsset.has(assetKey)) continue;
    const { data, error } = await supabaseAdmin.storage
      .from(meta.imageBucket)
      .createSignedUrl(meta.imageKey, signedUrlTtlSec);
    if (error) {
      storageUrlByAsset.set(assetKey, null);
      continue;
    }
    storageUrlByAsset.set(assetKey, data?.signedUrl ?? null);
  }

  const ownedPieces: OwnedPieceRow[] = ownedRows.map((row) => {
    const meta = pieceById.get(row.piece_id);
    const assetKey =
      meta?.imageBucket && meta?.imageKey ? `${meta.imageBucket}::${meta.imageKey}` : null;
    return {
      pieceId: row.piece_id,
      char: meta?.kanji ?? '',
      name: meta?.name ?? '',
      imageSignedUrl: assetKey ? (storageUrlByAsset.get(assetKey) ?? null) : null,
      quantity: row.quantity ?? 1,
      acquiredAt: row.acquired_at,
      source: row.source,
    };
  });

  const decks: DeckRow[] = deckRows.map((row) => ({
    deckId: row.deck_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    placements: (row.player_deck_placements ?? []).map((p) => {
      const meta = pieceById.get(p.piece_id);
      return {
        rowNo: p.row_no,
        colNo: p.col_no,
        pieceId: p.piece_id,
        char: meta?.kanji ?? '',
        name: meta?.name ?? '',
        imageSignedUrl:
          meta?.imageBucket && meta?.imageKey
            ? (storageUrlByAsset.get(`${meta.imageBucket}::${meta.imageKey}`) ?? null)
            : null,
      };
    }),
  }));

  return { ownedPieces, decks };
}

export type SaveDeckInput = {
  name: string;
  placements: { rowNo: number; colNo: number; pieceId: number }[];
};

export async function saveDeck(userId: string, input: SaveDeckInput): Promise<number> {
  const { data: deck, error: deckError } = await supabaseAdmin
    .from('player_decks')
    .insert({ player_id: userId, name: input.name })
    .select('deck_id')
    .single();

  if (deckError) throw deckError;

  const deckId = deck.deck_id as number;

  if (input.placements.length > 0) {
    const { error: placementError } = await supabaseAdmin.from('player_deck_placements').insert(
      input.placements.map((p) => ({
        deck_id: deckId,
        row_no: p.rowNo,
        col_no: p.colNo,
        piece_id: p.pieceId,
      })),
    );

    if (placementError) throw placementError;
  }

  return deckId;
}

export async function upsertDeck(userId: string, input: SaveDeckInput): Promise<number> {
  const { data: existingDecks, error: existingDeckError } = await supabaseAdmin
    .from('player_decks')
    .select('deck_id')
    .eq('player_id', userId)
    .eq('name', input.name)
    .order('deck_id', { ascending: true })
    .limit(1);

  if (existingDeckError) throw existingDeckError;

  let deckId = (existingDecks?.[0]?.deck_id as number | undefined) ?? null;

  if (!deckId) {
    const { data: deck, error: createDeckError } = await supabaseAdmin
      .from('player_decks')
      .insert({ player_id: userId, name: input.name })
      .select('deck_id')
      .single();

    if (createDeckError) throw createDeckError;
    deckId = deck.deck_id as number;
  }

  const { error: deletePlacementError } = await supabaseAdmin
    .from('player_deck_placements')
    .delete()
    .eq('deck_id', deckId);

  if (deletePlacementError) throw deletePlacementError;

  if (input.placements.length > 0) {
    const { error: insertPlacementError } = await supabaseAdmin
      .from('player_deck_placements')
      .insert(
        input.placements.map((p) => ({
          deck_id: deckId,
          row_no: p.rowNo,
          col_no: p.colNo,
          piece_id: p.pieceId,
        })),
      );

    if (insertPlacementError) throw insertPlacementError;
  }

  const { error: updateDeckError } = await supabaseAdmin
    .from('player_decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('deck_id', deckId)
    .eq('player_id', userId);

  if (updateDeckError) throw updateDeckError;

  return deckId;
}

export async function deleteDeck(userId: string, deckId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('player_decks')
    .delete()
    .eq('deck_id', deckId)
    .eq('player_id', userId);

  if (error) throw error;
}
