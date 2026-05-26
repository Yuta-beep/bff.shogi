-- 辺・逸・膠: 前斜め2 + 後1（前斜め前斜め後ろ1マス）
delete from master.m_move_pattern_vector v
using master.m_move_pattern mp
where v.move_pattern_id = mp.move_pattern_id
  and mp.move_code in ('move_gacha_hen', 'move_gacha_itsu', 'move_gacha_ko');

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, v.dx, v.dy, v.max_step, false, false
from master.m_move_pattern mp
cross join (
  values
    (-1, -1, 1),
    (1, -1, 1),
    (0, 1, 1)
) as v(dx, dy, max_step)
where mp.move_code in ('move_gacha_hen', 'move_gacha_itsu', 'move_gacha_ko')
on conflict (move_pattern_id, dx, dy, capture_only, move_only) do update
set max_step = excluded.max_step;
