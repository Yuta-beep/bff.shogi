-- 宋（ガチャ）の移動範囲説明を統一
update master.m_piece
set
  move_description_ja = '前後何マスでも+左右1マス',
  updated_at = now()
where kanji = '宋';
