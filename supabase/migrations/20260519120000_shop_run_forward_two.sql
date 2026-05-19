-- 走: 前方最大2マス（1マス目に駒があると2マス目不可）の移動説明・ベクトル
begin;

update master.m_move_pattern
set
  is_repeatable = false,
  can_jump = false,
  constraints_json = '{"mode":"piece_info_canMoveTo","source_move_code":"shop_run"}'::jsonb,
  updated_at = now()
where move_code = 'shop_run';

delete from master.m_move_pattern_vector v
using master.m_move_pattern mp
where mp.move_pattern_id = v.move_pattern_id
  and mp.move_code = 'shop_run';

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, v.dx, v.dy, v.max_step, false, false
from master.m_move_pattern mp
cross join (
  values
    (0, -1, 1),
    (0, -2, 1)
) as v(dx, dy, max_step)
where mp.move_code = 'shop_run';

update master.m_piece
set
  move_description_ja = '前方に最大2マス進める。1マス目に駒がある場合は2マス目には進めない。',
  updated_at = now()
where piece_code = 'piece_shop_so'
   or kanji = '走';

commit;
