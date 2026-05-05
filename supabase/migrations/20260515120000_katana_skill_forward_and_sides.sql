-- 刀スキル: 取ったマスから前方1マス＋左右1マスの敵も同時に取る。移動説明は前方1マス。

begin;

update master.m_piece p
set
  move_description_ja = '前方1マス。',
  updated_at = now()
from master.m_move_pattern mp
where mp.move_code = 'katana'
  and p.kanji = '刀'
  and p.move_pattern_id = mp.move_pattern_id;

update master.m_skill s
set
  skill_desc = '前方1マスで敵を取ったとき、そのマスから見て前方1マスと左右1マスにいる敵駒も同時に取ることができる。',
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b';

commit;
