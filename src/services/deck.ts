import { supabaseAdmin } from '@/lib/supabase-admin';

export type OwnedPieceRow = {
  pieceId: number;
  char: string;
  name: string;
  acquiredAt: string;
  source: string;
};

export type DeckPlacement = {
  rowNo: number;
  colNo: number;
  pieceId: number;
  char: string;
  name: string;
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
      .select('piece_id, acquired_at, source, m_piece:piece_id(kanji, name)')
      .eq('player_id', userId)
      .order('acquired_at', { ascending: true }),

    supabaseAdmin
      .from('player_decks')
      .select('deck_id, name, created_at, updated_at, player_deck_placements(row_no, col_no, piece_id, m_piece:piece_id(kanji, name))')
      .eq('player_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (ownedRes.error) throw ownedRes.error;
  if (decksRes.error) throw decksRes.error;

  const ownedPieces: OwnedPieceRow[] = (ownedRes.data ?? []).map((row: any) => ({
    pieceId: row.piece_id,
    char: row.m_piece?.kanji ?? '',
    name: row.m_piece?.name ?? '',
    acquiredAt: row.acquired_at,
    source: row.source,
  }));

  const decks: DeckRow[] = (decksRes.data ?? []).map((row: any) => ({
    deckId: row.deck_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    placements: (row.player_deck_placements ?? []).map((p: any) => ({
      rowNo: p.row_no,
      colNo: p.col_no,
      pieceId: p.piece_id,
      char: p.m_piece?.kanji ?? '',
      name: p.m_piece?.name ?? '',
    })),
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
    const { error: placementError } = await supabaseAdmin
      .from('player_deck_placements')
      .insert(
        input.placements.map((p) => ({
          deck_id: deckId,
          row_no: p.rowNo,
          col_no: p.colNo,
          piece_id: p.pieceId,
        }))
      );

    if (placementError) throw placementError;
  }

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
