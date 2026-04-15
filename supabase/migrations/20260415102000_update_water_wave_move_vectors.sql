-- 水/波 の移動範囲を調整
-- 水: 斜め4方向に最大2マス
-- 波: 縦横4方向に最大2マス

with target_patterns as (
  select move_pattern_id, move_code
  from master.m_move_pattern
  where move_code in ('water', 'wave')
)
delete from master.m_move_pattern_vector v
using target_patterns t
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
  src.capture_only,
  src.move_only
from (
  values
    ('water', -1, -1, 2, false, false),
    ('water',  1, -1, 2, false, false),
    ('water', -1,  1, 2, false, false),
    ('water',  1,  1, 2, false, false),
    ('wave',   0, -1, 2, false, false),
    ('wave',   0,  1, 2, false, false),
    ('wave',  -1,  0, 2, false, false),
    ('wave',   1,  0, 2, false, false)
) as src(move_code, dx, dy, max_step, capture_only, move_only)
join master.m_move_pattern mp on mp.move_code = src.move_code
on conflict (move_pattern_id, dx, dy, capture_only, move_only)
do update set
  max_step = excluded.max_step;
