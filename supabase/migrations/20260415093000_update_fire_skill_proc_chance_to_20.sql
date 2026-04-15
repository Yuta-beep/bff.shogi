-- 火 (skill_id = 4) の発動確率を 20% に統一する。
update master.m_skill
set
  skill_desc = '移動時20％の確率で相手の手持ち駒を1つ燃やす。',
  proc_chance = 0.2,
  updated_at = now()
where skill_id = 4;

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
where skill_id = 4
  and condition_type = 'chance_roll'
  and is_active = true;

update master.m_skill_effect
set
  proc_chance = 0.2,
  value_text = '移動時20％の確率で相手の手持ち駒を1つ燃やす。'
where skill_id = 4
  and effect_type in ('destroy_hand_piece', 'remove_piece')
  and is_active = true;
