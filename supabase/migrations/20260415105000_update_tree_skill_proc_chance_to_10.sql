-- 木 (skill_id = 7) の増殖スキル発動率を 10% にする。
update master.m_skill
set
  skill_desc = '10%の確率で木の成長により周囲に「木」駒を召喚する。',
  proc_chance = 0.1,
  updated_at = now()
where skill_id = 7;

update master.m_skill_condition
set
  condition_order = 2,
  params_json = coalesce(params_json, '{}'::jsonb)
where skill_id = 7
  and condition_type = 'adjacent_empty_exists'
  and is_active = true;

insert into master.m_skill_condition (
  skill_id,
  condition_order,
  condition_group,
  condition_type,
  params_json,
  is_active
)
select
  7,
  1,
  'probability',
  'chance_roll',
  '{"procChance":0.1}'::jsonb,
  true
where not exists (
  select 1
  from master.m_skill_condition
  where skill_id = 7
    and condition_type = 'chance_roll'
    and is_active = true
);

update master.m_skill_condition
set
  condition_group = 'probability',
  condition_order = 1,
  params_json = jsonb_set(
    jsonb_set(
      coalesce(params_json, '{}'::jsonb),
      '{procChance}',
      '0.1'::jsonb,
      true
    ),
    '{proc_chance}',
    '0.1'::jsonb,
    true
  )
where skill_id = 7
  and condition_type = 'chance_roll'
  and is_active = true;

update master.m_skill_effect
set
  proc_chance = 0.1,
  value_text = '10%の確率で木の成長により周囲に「木」駒を召喚する'
where skill_id = 7
  and effect_type = 'summon_piece'
  and is_active = true;
