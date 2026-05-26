-- 煽（ガチャ）の移動範囲説明を統一
update master.m_piece
set
  move_description_ja = '前後左右何マスでも',
  updated_at = now()
where kanji = '煽';
