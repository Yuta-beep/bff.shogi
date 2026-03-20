-- 特殊駒 (忍/影/砲/竜 等) の m_piece + m_piece_mapping seed
-- displayChar (NIN/KAG/HOU 等) ↔ sfen_code (C/D/E/F 等) ↔ kanji の単一ソース確立
--
-- piece_shogi_nin 等の piece_code を使用 (成り駒 piece_shogi_to と同形式)
-- sfen_code: フロントエンドの sfenCharToPieceCode() と対応するカスタム1文字 (C/D/E...)

begin;

-- ── Step 0: move_pattern が存在しない場合に備えて確保 ───────────────────────
--
-- 20260311114000_reseed_move_vectors_from_piece_info.sql は UPDATE のみで
-- INSERT は行っていない。move_pattern が存在しない環境 (新規 DB, CI 等) でも
-- 本 migration が単独で動くよう ON CONFLICT DO NOTHING で保証する。

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
  ('ninja',   '忍者',  false, true,  '{"mode":"piece_info_canMoveTo","source_move_code":"ninja"}'::jsonb,   true, now(), now()),
  ('shadow',  '影武者', true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"shadow"}'::jsonb,  true, now(), now()),
  ('cannon',  '砲',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"cannon"}'::jsonb,  true, now(), now()),
  ('dragon',  '竜',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"dragon"}'::jsonb,  true, now(), now()),
  ('phoenix', '鳳凰',  true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"phoenix"}'::jsonb, true, now(), now()),
  ('flame',   '炎',    false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"flame"}'::jsonb,   true, now(), now()),
  ('fire',    '火',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"fire"}'::jsonb,    true, now(), now()),
  ('water',   '水',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"water"}'::jsonb,   true, now(), now()),
  ('wave',    '波',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"wave"}'::jsonb,    true, now(), now()),
  ('tree',    '木',    false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"tree"}'::jsonb,    true, now(), now()),
  ('leaf',    '葉',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"leaf"}'::jsonb,    true, now(), now()),
  ('light',   '光',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"light"}'::jsonb,   true, now(), now()),
  ('star',    '星',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"star"}'::jsonb,    true, now(), now()),
  ('dark',    '闇',    false, false, '{"mode":"piece_info_canMoveTo","source_move_code":"dark"}'::jsonb,    true, now(), now()),
  ('demon',   '魔',    true,  false, '{"mode":"piece_info_canMoveTo","source_move_code":"demon"}'::jsonb,   true, now(), now())
on conflict (move_code) do nothing;

-- ── Step 1: m_piece に特殊駒を挿入 ──────────────────────────────────────────
--
-- move_pattern_id は move_code 名で JOIN して解決する。
-- 各 move_code は 20260311114000_reseed_move_vectors_from_piece_info.sql で登録済み。

with special_piece_defs as (
  select *
  from (
    values
      --  piece_code              kanji  name      move_code
      ('piece_shogi_nin',        '忍',  '忍者',    'ninja'),
      ('piece_shogi_kag',        '影',  '影武者',  'shadow'),
      ('piece_shogi_hou',        '砲',  '砲',      'cannon'),
      ('piece_shogi_ryu',        '竜',  '小竜',    'dragon'),
      ('piece_shogi_hoo',        '鳳',  '鳳凰',    'phoenix'),
      ('piece_shogi_enn',        '炎',  '炎',      'flame'),
      ('piece_shogi_fir',        '火',  '火',      'fire'),
      ('piece_shogi_sui',        '水',  '水',      'water'),
      ('piece_shogi_nam',        '波',  '波',      'wave'),
      ('piece_shogi_mok',        '木',  '木',      'tree'),
      ('piece_shogi_haa',        '葉',  '葉',      'leaf'),
      ('piece_shogi_hik',        '光',  '光',      'light'),
      ('piece_shogi_hos',        '星',  '星',      'star'),
      ('piece_shogi_yam',        '闇',  '闇',      'dark'),
      ('piece_shogi_mak',        '魔',  '魔',      'demon')
  ) as v(piece_code, kanji, name, move_code)
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
  d.name || 'の移動',
  'N',
  'supabase',
  null,
  null,
  1,
  true,
  now(),
  null,
  now(),
  now()
from special_piece_defs d
join master.m_move_pattern mp on mp.move_code = d.move_code
on conflict (kanji) do update
  set piece_code        = excluded.piece_code,
      name              = excluded.name,
      move_pattern_id   = excluded.move_pattern_id,
      is_active         = true,
      updated_at        = now();

-- ── Step 2: m_piece_mapping に特殊駒エントリを挿入 ──────────────────────────
--
-- sfen_code: フロントエンド sfenCharToPieceCode() / sfenCharToDisplayChar() と対応
--            C=NIN, D=KAG, E=HOU, F=RYU, H=HOO, I=ENN, J=FIR,
--            M=SUI, Q=NAM, T=MOK, U=HAA, V=HIK, W=HOS, X=YAM, Y=MAK
-- is_special = true, is_promoted = false, sfen_code は NULL ではなくカスタム文字

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
  v.canonical_code,
  true,
  false,
  true,
  now(),
  now()
from (
  values
    --  piece_code              sfen  display  canonical
    ('piece_shogi_nin',        'C',  'NIN',   'ninja'),
    ('piece_shogi_kag',        'D',  'KAG',   'shadow'),
    ('piece_shogi_hou',        'E',  'HOU',   'cannon'),
    ('piece_shogi_ryu',        'F',  'RYU',   'dragon'),
    ('piece_shogi_hoo',        'H',  'HOO',   'phoenix'),
    ('piece_shogi_enn',        'I',  'ENN',   'flame'),
    ('piece_shogi_fir',        'J',  'FIR',   'fire'),
    ('piece_shogi_sui',        'M',  'SUI',   'water'),
    ('piece_shogi_nam',        'Q',  'NAM',   'wave'),
    ('piece_shogi_mok',        'T',  'MOK',   'tree'),
    ('piece_shogi_haa',        'U',  'HAA',   'leaf'),
    ('piece_shogi_hik',        'V',  'HIK',   'light'),
    ('piece_shogi_hos',        'W',  'HOS',   'star'),
    ('piece_shogi_yam',        'X',  'YAM',   'dark'),
    ('piece_shogi_mak',        'Y',  'MAK',   'demon')
) as v(piece_code, sfen_code, display_char, canonical_code)
join master.m_piece p on p.piece_code = v.piece_code
on conflict on constraint m_piece_mapping_display_char_uq do update
  set sfen_code            = excluded.sfen_code,
      canonical_piece_code = excluded.canonical_piece_code,
      is_special           = true,
      is_active            = true,
      updated_at           = now();

commit;
