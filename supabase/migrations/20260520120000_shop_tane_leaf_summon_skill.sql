-- 種: 移動時20%で周囲ランダム1マスに葉を召喚（スキル説明の更新）
begin;

update master.m_piece
set
  move_description_ja = '移動時20%の確率で、周囲8マスのランダムな空きマス1マスに「葉」駒を召喚する。',
  updated_at = now()
where piece_code = 'piece_shop_tane'
   or kanji = '種';

commit;
