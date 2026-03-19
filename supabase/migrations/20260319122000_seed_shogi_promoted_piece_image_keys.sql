-- Seed image keys for standard shogi promoted pieces.
-- Use ASCII keys only: pieces/promoted/piece-<piece_id>.png

begin;

update master.m_piece as p
set
  image_source = 'supabase',
  image_bucket = 'piece-images',
  image_key = 'pieces/promoted/piece-' || p.piece_id::text || '.png',
  image_version = 1,
  updated_at = now()
where p.piece_code in (
  'piece_shogi_to',
  'piece_shogi_ny',
  'piece_shogi_nk',
  'piece_shogi_ng',
  'piece_shogi_um',
  'piece_shogi_ry'
);

commit;
