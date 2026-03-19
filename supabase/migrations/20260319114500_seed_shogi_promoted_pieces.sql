-- Seed standard shogi promoted pieces and promotion mappings.

begin;

insert into master.m_move_pattern (
  move_code,
  move_name,
  is_repeatable,
  can_jump,
  constraints_json,
  is_active,
  created_at,
  updated_at
)
values
  (
    'shogi_horse',
    '馬(角行+王の直交1マス)',
    true,
    false,
    '{"mode":"shogi_standard","piece":"UM"}'::jsonb,
    true,
    now(),
    now()
  ),
  (
    'shogi_dragon',
    '龍(飛車+王の斜め1マス)',
    true,
    false,
    '{"mode":"shogi_standard","piece":"RY"}'::jsonb,
    true,
    now(),
    now()
  )
on conflict (move_code) do update
set
  move_name = excluded.move_name,
  is_repeatable = excluded.is_repeatable,
  can_jump = excluded.can_jump,
  constraints_json = excluded.constraints_json,
  is_active = true,
  updated_at = now();

with target_patterns as (
  select move_pattern_id
  from master.m_move_pattern
  where move_code in ('shogi_horse', 'shogi_dragon')
)
delete from master.m_move_pattern_vector as v
using target_patterns as t
where v.move_pattern_id = t.move_pattern_id;

insert into master.m_move_pattern_vector (
  move_pattern_id,
  dx,
  dy,
  max_step,
  capture_only,
  move_only
)
select
  mp.move_pattern_id,
  src.dx,
  src.dy,
  src.max_step,
  false,
  false
from (
  values
    ('shogi_horse', -1, -1, 8),
    ('shogi_horse', 1, -1, 8),
    ('shogi_horse', -1, 1, 8),
    ('shogi_horse', 1, 1, 8),
    ('shogi_horse', 0, -1, 1),
    ('shogi_horse', -1, 0, 1),
    ('shogi_horse', 1, 0, 1),
    ('shogi_horse', 0, 1, 1),
    ('shogi_dragon', 0, -1, 8),
    ('shogi_dragon', 0, 1, 8),
    ('shogi_dragon', -1, 0, 8),
    ('shogi_dragon', 1, 0, 8),
    ('shogi_dragon', -1, -1, 1),
    ('shogi_dragon', 1, -1, 1),
    ('shogi_dragon', -1, 1, 1),
    ('shogi_dragon', 1, 1, 1)
) as src(move_code, dx, dy, max_step)
join master.m_move_pattern mp
  on mp.move_code = src.move_code
on conflict (move_pattern_id, dx, dy, capture_only, move_only) do update
set
  max_step = excluded.max_step;

with promoted_piece_defs as (
  select *
  from (
    values
      ('piece_shogi_to', 'と', 'と金', 'gold'),
      ('piece_shogi_ny', '成香', '成香', 'gold'),
      ('piece_shogi_nk', '成桂', '成桂', 'gold'),
      ('piece_shogi_ng', '成銀', '成銀', 'gold'),
      ('piece_shogi_um', '馬', '馬', 'shogi_horse'),
      ('piece_shogi_ry', '龍', '龍王', 'shogi_dragon')
  ) as v(piece_code, kanji, name, move_code)
)
insert into master.m_piece (
  piece_code,
  kanji,
  name,
  move_pattern_id,
  skill_id,
  move_description_ja,
  rarity,
  image_source,
  image_bucket,
  image_key,
  image_version,
  is_active,
  published_at,
  unpublished_at,
  created_at,
  updated_at
)
select
  d.piece_code,
  d.kanji,
  d.name,
  mp.move_pattern_id,
  null,
  d.name || 'の移動',
  'N',
  'supabase',
  null,
  null,
  1,
  true,
  now(),
  null,
  now(),
  now()
from promoted_piece_defs d
join master.m_move_pattern mp
  on mp.move_code = d.move_code
on conflict (kanji) do update
set
  piece_code = excluded.piece_code,
  name = excluded.name,
  move_pattern_id = excluded.move_pattern_id,
  is_active = true,
  updated_at = now();

with mappings as (
  select *
  from (
    values
      ('歩', 'と'),
      ('香', '成香'),
      ('桂', '成桂'),
      ('銀', '成銀'),
      ('角', '馬'),
      ('飛', '龍')
  ) as v(base_kanji, promoted_kanji)
)
insert into master.m_piece_promotion (
  base_piece_id,
  promoted_piece_id,
  is_active,
  created_at,
  updated_at
)
select
  base_piece.piece_id,
  promoted_piece.piece_id,
  true,
  now(),
  now()
from mappings m
join master.m_piece base_piece
  on base_piece.kanji = m.base_kanji
join master.m_piece promoted_piece
  on promoted_piece.kanji = m.promoted_kanji
on conflict (base_piece_id) do update
set
  promoted_piece_id = excluded.promoted_piece_id,
  is_active = true,
  updated_at = now();

commit;
