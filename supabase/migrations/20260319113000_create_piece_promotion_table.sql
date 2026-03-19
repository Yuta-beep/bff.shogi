-- Promotion relation master table.
-- Keeps base -> promoted piece mapping independent from master.m_piece.

create table if not exists master.m_piece_promotion (
  base_piece_id bigint primary key
    references master.m_piece(piece_id),
  promoted_piece_id bigint not null unique
    references master.m_piece(piece_id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint m_piece_promotion_distinct_chk
    check (base_piece_id <> promoted_piece_id)
);
