-- 舞: 移動制限スキルはスキル説明へ、移動説明は金相当のみ
begin;

update master.m_piece
set
  move_description_ja = '前・前斜め左右・左右・後に各1マス進める。',
  updated_at = now()
where piece_code = 'piece_shop_mai'
   or kanji = '舞';

commit;
