-- 銃の斜め後ろ2マス（中間貫通）と刀／剣などの piece_code 欠損を補う。
-- クライアントの `capturedToHandPieceCode` と併用し、API 経由の盤面でも手駒キーが解決しやすくする。

begin;

-- 銃の移動ベクトル（前方縦2＋斜め後ろ2）をマスタで再保証
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

-- piece_code が空のとき、漢字から canonical を補う（既存値は上書きしない）
update master.m_piece p
set piece_code = 'sword', updated_at = now()
where p.kanji in ('刀', '剣')
  and (p.piece_code is null or btrim(p.piece_code) = '');

update master.m_piece p
set piece_code = 'gun', updated_at = now()
where p.kanji = '銃'
  and (p.piece_code is null or btrim(p.piece_code) = '');

update master.m_piece p
set piece_code = 'armor', updated_at = now()
where p.kanji = '鎧'
  and (p.piece_code is null or btrim(p.piece_code) = '');

update master.m_piece p
set piece_code = 'shield', updated_at = now()
where p.kanji = '盾'
  and (p.piece_code is null or btrim(p.piece_code) = '');

commit;
