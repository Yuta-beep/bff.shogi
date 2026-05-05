-- 刀: 剣と共有していた sword パターンから分離し前方1マスのみ。
-- 銃: 前方2マスはアプリ側で貫通扱い。DBベクトルは斜め後ろ2マスのみ。
-- 鎧: 移動ベクトルは従来の前後左右1マスのまま（取りルールはアプリ）。

begin;

insert into master.m_move_pattern (move_code, move_name, is_repeatable, can_jump, constraints_json, is_active, created_at, updated_at)
values ('katana', 'katana', false, false, null::jsonb, true, now(), now())
on conflict (move_code) do update set
  move_name = excluded.move_name,
  is_repeatable = excluded.is_repeatable,
  can_jump = excluded.can_jump,
  constraints_json = excluded.constraints_json,
  is_active = excluded.is_active,
  updated_at = now();

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, 0, -1, 1, false, false
from master.m_move_pattern mp
where mp.move_code = 'katana'
on conflict (move_pattern_id, dx, dy, capture_only, move_only) do update set
  max_step = excluded.max_step;

update master.m_piece p
set
  move_pattern_id = mp.move_pattern_id,
  move_description_ja = '前方に1マス移動できる。',
  updated_at = now()
from master.m_move_pattern mp
where mp.move_code = 'katana'
  and p.kanji = '刀';

delete from master.m_move_pattern_vector v
using master.m_move_pattern mp
where v.move_pattern_id = mp.move_pattern_id
  and mp.move_code = 'gun';

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, v.dx, v.dy, v.max_step, false, false
from master.m_move_pattern mp
cross join (
  values
    (-1, 1, 2),
    (1, 1, 2)
) as v(dx, dy, max_step)
where mp.move_code = 'gun';

update master.m_piece p
set
  move_description_ja = '前方に最大2マス（1マス目に敵がいても2マス目へ移動しまとめて取れる）。斜め後ろに最大2マス移動できる。',
  updated_at = now()
where p.kanji = '銃';

update master.m_piece p
set
  move_description_ja = '前後左右に1マスずつ移動できる。敵駒を取れず、敵からも取られない。',
  updated_at = now()
where p.kanji = '鎧';

commit;
