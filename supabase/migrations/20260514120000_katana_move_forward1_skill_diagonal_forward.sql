-- 刀: 移動説明を前方1マスに。スキルは「前方1マスで取ったあと斜め前1マスの敵も同時に取る」に揃える。

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
  skill_desc = '前方1マスの敵駒を取ったとき、斜め前1マスにいた敵駒も同時に取ることができる。',
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b';

commit;
