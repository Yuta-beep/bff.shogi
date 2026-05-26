-- 漢検1級ガチャから「殲」「賚」を除外し、ガチャ駒を図鑑・デッキで使えるよう公開状態にする。

begin;

update master.m_gacha_piece as gp
set
  is_active = false,
  updated_at = now()
from master.m_gacha as g
join master.m_piece as p on p.piece_id = gp.piece_id
where gp.gacha_id = g.gacha_id
  and g.gacha_code = 'kanken1'
  and p.kanji in ('殲', '賚');

update master.m_gacha
set
  rarity_rate_n = 0.9100,
  rarity_rate_r = 0.0000,
  rarity_rate_sr = 0.0000,
  rarity_rate_ur = 0.0600,
  rarity_rate_ssr = 0.0300,
  updated_at = now()
where gacha_code = 'kanken1';

-- ガチャ排出駒（および「灯」）を図鑑 API で返せるよう公開
update master.m_piece
set
  is_active = true,
  unpublished_at = null,
  updated_at = now()
where piece_code like 'piece_gacha_%'
   or kanji in (
     '灯',
     '室',
     '定',
     '安',
     '宋',
     '爆',
     '煽',
     '辺',
     '逸',
     '進',
     '逃',
     '艸',
     '閹',
     '膠',
     '殲',
     '賚'
   );

commit;
