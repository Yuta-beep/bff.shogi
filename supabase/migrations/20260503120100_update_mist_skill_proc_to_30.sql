-- 霧 (skill_code = skill_1ed80d5124bd): 発動率と説明文を 30% に統一する。
begin;

update master.m_skill
set
  skill_desc = '周囲の敵駒を30％の確率で相手の持ち駒に送る。',
  proc_chance = 0.3,
  updated_at = now()
where skill_code = 'skill_1ed80d5124bd';

update master.m_skill_condition c
set
  params_json = jsonb_set(
    jsonb_set(
      coalesce(c.params_json, '{}'::jsonb),
      '{procChance}',
      '0.3'::jsonb,
      true
    ),
    '{proc_chance}',
    '0.3'::jsonb,
    true
  )
from master.m_skill s
where s.skill_code = 'skill_1ed80d5124bd'
  and c.skill_id = s.skill_id
  and c.condition_type = 'chance_roll'
  and c.is_active = true;

update master.m_skill_effect e
set
  proc_chance = 0.3,
  value_text = '周囲の敵駒を30％の確率で相手の持ち駒に送る。',
  updated_at = now()
from master.m_skill s
where s.skill_code = 'skill_1ed80d5124bd'
  and e.skill_id = s.skill_id
  and e.effect_type = 'send_to_hand'
  and e.is_active = true;

commit;
