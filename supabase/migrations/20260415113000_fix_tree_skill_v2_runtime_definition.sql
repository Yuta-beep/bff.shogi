-- 木 (skill_id = 7) の増殖スキルを V2 実行定義として有効化し、移動時10%発動に統一する。

update master.m_skill
set
  skill_desc = '移動時10%の確率で木の成長により周囲に「木」駒を召喚する。',
  proc_chance = 0.1,
  implementation_kind = 'primitive',
  trigger_group = 'event_move',
  trigger_type = 'after_move',
  source_kind = coalesce(source_kind, 'piece_info'),
  source_file = coalesce(source_file, '../../SHOGI_GAME/piece_info.html'),
  source_function = coalesce(source_function, 'skill_7'),
  tags_json = '["move_trigger","summon_piece","probabilistic"]'::jsonb,
  script_hook = null,
  updated_at = now()
where skill_id = 7;

update master.m_skill_condition
set
  condition_order = 2,
  condition_group = 'board_state',
  params_json = coalesce(params_json, '{}'::jsonb),
  is_active = true
where skill_id = 7
  and condition_type = 'adjacent_empty_exists';

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
);

update master.m_skill_condition
set
  condition_order = 1,
  condition_group = 'probability',
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
  ),
  is_active = true
where skill_id = 7
  and condition_type = 'chance_roll';

insert into master.m_skill_effect (
  skill_id,
  effect_order,
  effect_group,
  effect_type,
  target_group,
  target_selector,
  params_json,
  proc_chance,
  is_active
)
select
  7,
  1,
  'piece_generation',
  'summon_piece',
  'adjacent',
  'adjacent_empty',
  '{"summonPieceChar":"木","placementRule":"first_adjacent_empty","maxCount":1}'::jsonb,
  0.1,
  true
where not exists (
  select 1
  from master.m_skill_effect
  where skill_id = 7
    and effect_order = 1
);

update master.m_skill_effect
set
  effect_group = 'piece_generation',
  effect_type = 'summon_piece',
  target_group = 'adjacent',
  target_selector = 'adjacent_empty',
  params_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(params_json, '{}'::jsonb),
        '{summonPieceChar}',
        '"木"'::jsonb,
        true
      ),
      '{placementRule}',
      '"first_adjacent_empty"'::jsonb,
      true
    ),
    '{maxCount}',
    '1'::jsonb,
    true
  ),
  proc_chance = 0.1,
  value_text = '移動時10%の確率で木の成長により周囲に「木」駒を召喚する',
  is_active = true
where skill_id = 7
  and effect_order = 1;
