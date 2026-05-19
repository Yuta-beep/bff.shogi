-- 麒: 取られ免疫はスキル説明へ、移動説明は移動のみ
begin;

update master.m_piece
set
  move_description_ja = '前後左右に何マスでも進める。斜め4方向に1マス進める。',
  updated_at = now()
where piece_code = 'piece_shop_kirin'
   or kanji = '麒';

commit;
