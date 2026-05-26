-- 進（ガチャ）の移動範囲説明を統一
update master.m_piece
set
  move_description_ja = '移動範囲不明',
  updated_at = now()
where kanji = '進';
