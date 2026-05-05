-- 刀スキル（skill_dc1e194f434b）と銃の移動ベクトルをマスタ上で上書きする。
-- 既存 DB に 20260503120000 が未適用でも、このマイグレで銃の前方2＋斜め後ろ2を保証する。

begin;

-- 銃: 前方2マス＋斜め後ろ2マス（API カタログの moveVectors 用）
delete from master.m_move_pattern_vector v
using master.m_move_pattern mp
where v.move_pattern_id = mp.move_pattern_id
  and mp.move_code = 'gun';

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, v.dx, v.dy, v.max_step, false, false
from master.m_move_pattern mp
cross join (
  values
    (0, -1, 2),
    (-1, 1, 2),
    (1, 1, 2)
) as v(dx, dy, max_step)
where mp.move_code = 'gun';

-- 刀: katana パターンを保証し、刀駒を紐付け
insert into master.m_move_pattern (move_code, move_name, is_repeatable, can_jump, constraints_json, is_active, created_at, updated_at)
values ('katana', 'katana', false, false, null::jsonb, true, now(), now())
on conflict (move_code) do update set
  move_name = excluded.move_name,
  is_repeatable = excluded.is_repeatable,
  can_jump = excluded.can_jump,
  constraints_json = excluded.constraints_json,
  is_active = excluded.is_active,
  updated_at = now();

insert into master.m_move_pattern_vector (move_pattern_id, dx, dy, max_step, capture_only, move_only)
select mp.move_pattern_id, 0, -1, 1, false, false
from master.m_move_pattern mp
where mp.move_code = 'katana'
on conflict (move_pattern_id, dx, dy, capture_only, move_only) do update set
  max_step = excluded.max_step;

update master.m_piece p
set
  move_pattern_id = mp.move_pattern_id,
  move_description_ja = '前方に1マス移動できる。',
  updated_at = now()
from master.m_move_pattern mp
where mp.move_code = 'katana'
  and p.kanji = '刀';

-- 刀スキル: V2 実行用メタ（クライアント／BFF の skill_definitions_v2 組み立て用）
update master.m_skill s
set
  skill_desc = '敵駒を取ったとき、その駒の左右の隣にいる敵駒もまとめて取る。',
  implementation_kind = 'primitive',
  trigger_group = 'event_capture',
  trigger_type = 'after_capture',
  parse_status = 'rule_only_v2',
  tags_json = '["capture_trigger","multi_capture"]'::jsonb,
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b';

-- 銃スキル
update master.m_skill s
set
  skill_desc = '移動後、前方1マス目と2マス目にいる敵駒をまとめて取る（王・玉・鎧を除く）。',
  implementation_kind = 'primitive',
  trigger_group = 'continuous',
  trigger_type = 'continuous_rule',
  parse_status = 'rule_only_v2',
  tags_json = '["continuous_rule","multi_capture"]'::jsonb,
  updated_at = now()
where s.skill_code = 'skill_a517ef7b8361';

update master.m_piece p
set
  move_description_ja = '前方に最大2マス、斜め後ろに最大2マス移動できる。前方は1マス目に敵がいても2マス目へ進みまとめて取れる。',
  updated_at = now()
where p.kanji = '銃';

commit;
