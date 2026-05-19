-- 駒ショップ販売駒（走・種・麒・舞・P・鳴）の master 登録
begin;

insert into master.m_move_pattern (
  move_code,
  move_name,
  is_repeatable,
  can_jump,
  constraints_json,
  is_active,
  created_at,
  updated_at
)
values
  ('shop_run', '走', false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_run"}'::jsonb, true, now(), now()),
  ('shop_tane', '種', false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_tane"}'::jsonb, true, now(), now()),
  ('shop_kirin', '麒', true, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_kirin"}'::jsonb, true, now(), now()),
  ('shop_mai', '舞', false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_mai"}'::jsonb, true, now(), now()),
  ('shop_p', 'P', false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_p"}'::jsonb, true, now(), now()),
  ('shop_naku', '鳴', false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"shop_naku"}'::jsonb, true, now(), now())
on conflict (move_code) do nothing;

with shop_piece_defs as (
  select *
  from (
    values
      ('piece_shop_so', '走', '走', 'shop_run', '前方に最大2マス進める。1マス目に駒がある場合は2マス目には進めない。'),
      ('piece_shop_tane', '種', '種', 'shop_tane', '移動時20%の確率で、周囲8マスのランダムな空きマス1マスに「葉」駒を召喚する。'),
      ('piece_shop_kirin', '麒', '麒', 'shop_kirin', '左右前後何マスでも移動 + 斜め1マス。金・銀・歩から取られない。'),
      ('piece_shop_mai', '舞', '舞', 'shop_mai', '金と同じ移動範囲。周囲8マスの敵駒の移動範囲を斜め前1マスのみに制限する。'),
      ('piece_shop_p', 'P', 'P', 'shop_p', '縦横1マス移動。移動時同じ行と列にいる敵駒を移動不能にする。'),
      ('piece_shop_naku', '鳴', '鳴', 'shop_naku', '銀と同じ移動範囲。移動時もし相手駒に同じ駒が3体いる場合、その3体をまとめて取る(ポン)。')
  ) as v(piece_code, kanji, name, move_code, move_description_ja)
)
insert into master.m_piece (
  piece_code,
  kanji,
  name,
  move_pattern_id,
  skill_id,
  move_description_ja,
  rarity,
  image_source,
  image_bucket,
  image_key,
  image_version,
  is_active,
  published_at,
  unpublished_at,
  created_at,
  updated_at
)
select
  d.piece_code,
  d.kanji,
  d.name,
  mp.move_pattern_id,
  null,
  d.move_description_ja,
  'SR',
  'supabase',
  null,
  null,
  1,
  true,
  now(),
  null,
  now(),
  now()
from shop_piece_defs d
join master.m_move_pattern mp on mp.move_code = d.move_code
on conflict (kanji) do update
  set piece_code = excluded.piece_code,
      name = excluded.name,
      move_pattern_id = excluded.move_pattern_id,
      move_description_ja = excluded.move_description_ja,
      is_active = true,
      updated_at = now();

insert into master.m_piece_mapping (
  piece_id,
  sfen_code,
  display_char,
  canonical_piece_code,
  is_special,
  is_promoted,
  is_active,
  created_at,
  updated_at
)
select
  p.piece_id,
  v.sfen_code,
  v.display_char,
  v.canonical_piece_code,
  true,
  false,
  true,
  now(),
  now()
from (
  values
    ('走', '+', 'SO', 'shop_so'),
    ('種', ',', 'TANE', 'shop_tane'),
    ('麒', '-', 'KIRIN', 'shop_kirin'),
    ('舞', '.', 'MAI', 'shop_mai'),
    ('P', '!', 'SHOP_P', 'shop_p'),
    ('鳴', '@', 'NAKU', 'shop_naku')
) as v(kanji, sfen_code, display_char, canonical_piece_code)
join master.m_piece p on p.kanji = v.kanji
on conflict on constraint m_piece_mapping_display_char_uq do update
  set piece_id = excluded.piece_id,
      sfen_code = excluded.sfen_code,
      canonical_piece_code = excluded.canonical_piece_code,
      is_special = true,
      is_active = true,
      updated_at = now();

commit;
