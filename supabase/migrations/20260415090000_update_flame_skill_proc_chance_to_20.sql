-- 炎 (skill_id = 3) の発動確率を 20% に統一する。
update master.m_skill
set
  skill_desc = '20%の確率で周囲の敵駒を消滅させる。',
  proc_chance = 0.2,
  updated_at = now()
where skill_id = 3;

update master.m_skill_condition
set
  params_json = jsonb_set(
    jsonb_set(
      coalesce(params_json, '{}'::jsonb),
      '{procChance}',
      '0.2'::jsonb,
      true
    ),
    '{proc_chance}',
    '0.2'::jsonb,
    true
  )
where skill_id = 3
  and condition_type = 'chance_roll'
  and is_active = true;

update master.m_skill_effect
set
  proc_chance = 0.2,
  value_text = '20%の確率で周囲の敵駒を消滅させる'
where skill_id = 3
  and effect_type = 'remove_piece'
  and is_active = true;
