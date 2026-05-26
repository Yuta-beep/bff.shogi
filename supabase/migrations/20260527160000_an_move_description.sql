-- 安（ガチャ）の移動範囲説明を統一
update master.m_piece
set
  move_description_ja = '前後左右1マス+桂馬飛び',
  updated_at = now()
where kanji = '安';
