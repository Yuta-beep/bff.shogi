begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_type_enum'
  ) then
    create type master.skill_type_enum as enum (
      'active_or_passive',
      'active_or_triggered',
      'passive'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_target_rule_enum'
  ) then
    create type master.skill_target_rule_enum as enum (
      'self',
      'adjacent_area',
      'adjacent_8',
      'enemy_piece',
      'ally_piece',
      'board_cell',
      'enemy_hand',
      'hand_piece',
      'front_enemy',
      'left_right',
      'same_row',
      'same_row_or_col',
      'empty_cell',
      'all_enemy',
      'all_ally',
      'unspecified'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_trigger_timing_enum'
  ) then
    create type master.skill_trigger_timing_enum as enum (
      'after_move',
      'on_capture',
      'on_capture_attempt',
      'on_captured',
      'on_condition_met',
      'on_move',
      'on_other_piece_move',
      'on_turn_start',
      'on_turn_end',
      'on_ally_captured',
      'passive'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_effect_type_enum'
  ) then
    create type master.skill_effect_type_enum as enum (
      'apply_status',
      'board_hazard',
      'buff',
      'capture_constraint',
      'capture_with_leap',
      'composite',
      'copy_ability',
      'custom',
      'debuff',
      'defense_or_immunity',
      'destroy_hand_piece',
      'disable_piece',
      'extra_action',
      'forced_move',
      'gain_piece',
      'heal',
      'inherit_ability',
      'linked_action',
      'modify_movement',
      'multi_capture',
      'reflective_movement',
      'remove_piece',
      'return_to_hand',
      'revive',
      'scripted',
      'seal_skill',
      'send_to_hand',
      'substitute',
      'summon_piece',
      'transform_piece'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_effect_summary_type_enum'
  ) then
    create type master.skill_effect_summary_type_enum as enum (
      'apply_status',
      'board_hazard',
      'buff',
      'capture_constraint',
      'capture_with_leap',
      'composite',
      'copy_ability',
      'custom',
      'debuff',
      'defense_or_immunity',
      'destroy_hand_piece',
      'disable_piece',
      'extra_action',
      'forced_move',
      'gain_piece',
      'heal',
      'inherit_ability',
      'linked_action',
      'modify_movement',
      'multi_capture',
      'reflective_movement',
      'remove_piece',
      'return_to_hand',
      'revive',
      'scripted',
      'seal_skill',
      'send_to_hand',
      'substitute',
      'summon_piece',
      'transform_piece'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'master' and t.typname = 'skill_parse_status_enum'
  ) then
    create type master.skill_parse_status_enum as enum (
      'rule_only_v2',
      'rule_only_v1',
      'hybrid_rule_and_script_v1',
      'raw_text',
      'manual',
      'manual_admin'
    );
  end if;
end
$$;

update master.m_skill
set
  skill_type = 'active_or_passive'
where skill_type::text in ('passive', 'active_or_triggered')
   or skill_type is null
   or btrim(skill_type::text) = '';

update master.m_skill
set
  target_rule = 'unspecified'
where target_rule is null or btrim(target_rule::text) = '';

update master.m_skill
set
  effect_summary_type = 'scripted'
where effect_summary_type is null or btrim(effect_summary_type::text) = '';

update master.m_skill
set
  parse_status = 'rule_only_v2'
where parse_status::text in (
  'raw_text',
  'manual',
  'manual_admin',
  'rule_only_v1',
  'hybrid_rule_and_script_v1'
)
   or parse_status is null
   or btrim(parse_status::text) = '';

update master.m_skill_effect
set
  target_rule = 'unspecified'
where target_rule is null or btrim(target_rule::text) = '';

alter table master.m_skill
  alter column skill_type drop default,
  alter column target_rule drop default,
  alter column effect_summary_type drop default,
  alter column parse_status drop default,
  alter column trigger_timing type master.skill_trigger_timing_enum using trigger_timing::master.skill_trigger_timing_enum,
  alter column skill_type type master.skill_type_enum using skill_type::master.skill_type_enum,
  alter column target_rule type master.skill_target_rule_enum using target_rule::master.skill_target_rule_enum,
  alter column effect_summary_type type master.skill_effect_summary_type_enum using effect_summary_type::master.skill_effect_summary_type_enum,
  alter column parse_status type master.skill_parse_status_enum using parse_status::master.skill_parse_status_enum,
  alter column skill_type set default 'active_or_passive'::master.skill_type_enum,
  alter column target_rule set default 'unspecified'::master.skill_target_rule_enum,
  alter column effect_summary_type set default 'scripted'::master.skill_effect_summary_type_enum,
  alter column parse_status set default 'rule_only_v2'::master.skill_parse_status_enum;

alter table master.m_skill_effect
  alter column effect_type type master.skill_effect_type_enum using effect_type::master.skill_effect_type_enum,
  alter column target_rule type master.skill_target_rule_enum using target_rule::master.skill_target_rule_enum,
  alter column trigger_timing type master.skill_trigger_timing_enum using trigger_timing::master.skill_trigger_timing_enum;

commit;
