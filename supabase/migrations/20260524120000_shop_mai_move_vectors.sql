-- 舞: 金と同形6方向1マス（HTML danceMoves / goldMoves と同形）
begin;

update master.m_move_pattern
set
  is_repeatable = false,
  can_jump = false,
  constraints_json = '{"mode":"piece_info_canMoveTo","source_move_code":"shop_mai"}'::jsonb,
  updated_at = now()
where move_code = 'shop_mai';

delete from master.m_move_pattern_vector v
using master.m_move_pattern mp
where mp.move_pattern_id = v.move_pattern_id
  and mp.move_code = 'shop_mai';

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, v.dx, v.dy, v.max_step, false, false
from master.m_move_pattern mp
cross join (
  values
    (-1, -1, 1),
    (0, -1, 1),
    (1, -1, 1),
    (-1, 0, 1),
    (1, 0, 1),
    (0, 1, 1)
) as v(dx, dy, max_step)
where mp.move_code = 'shop_mai';

commit;
