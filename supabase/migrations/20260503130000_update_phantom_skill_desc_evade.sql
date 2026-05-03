-- 幻 (skill_code = skill_5192a109720d): 説明文を仕様どおりに更新する。
begin;

update master.m_skill
set
  skill_desc = '周囲に空きマスがあるとき、敵駒に取られるとき50％の確率で取られるのを回避して空きマスに移動する。',
  updated_at = now()
where skill_code = 'skill_5192a109720d';

update master.m_skill_effect e
set
  value_text = '周囲に空きマスがあるとき、被捕獲時50%で回避して空きマスへ移動',
  updated_at = now()
from master.m_skill s
where s.skill_code = 'skill_5192a109720d'
  and e.skill_id = s.skill_id
  and e.effect_type = 'defense_or_immunity'
  and e.is_active = true;

commit;
