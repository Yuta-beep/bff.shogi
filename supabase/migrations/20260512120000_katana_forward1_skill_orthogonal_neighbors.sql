-- 刀: 前方1マスのみ（katana ベクトル）＋取ったマスの前後左右の隣の敵もまとめて取るスキル文言を揃える。

begin;

-- 刀の移動（前方1のみ）を再保証
insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, 0, -1, 1, false, false
from master.m_move_pattern mp
where mp.move_code = 'katana'
on conflict (move_pattern_id, dx, dy, capture_only, move_only) do update set
  max_step = excluded.max_step;

update master.m_piece p
set
  move_description_ja = '前方に1マスだけ移動できる。',
  updated_at = now()
from master.m_move_pattern mp
where mp.move_code = 'katana'
  and p.kanji = '刀'
  and p.move_pattern_id = mp.move_pattern_id;

update master.m_skill s
set
  skill_desc = '前方1マスに進んで敵駒を取ったとき、そのマスの前後左右にいる敵駒もまとめて取る。',
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b';

commit;
