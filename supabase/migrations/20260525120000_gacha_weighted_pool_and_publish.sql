-- 4種ガチャ: gacha_room.html と同じ重み付きプール（合計100）で排出。
-- 公開期限を延長（2026-04-01 切れを解消）。

begin;

update master.m_gacha
set
  unpublished_at = null,
  is_active = true,
  published_at = coalesce(published_at, now()),
  updated_at = now()
where gacha_code in ('hihen', 'ukanmuri', 'shinnyo', 'kanken1');

update master.m_gacha
set
  rarity_rate_n = 0.7000,
  rarity_rate_r = 0.1500,
  rarity_rate_sr = 0.1000,
  rarity_rate_ur = 0.0500,
  rarity_rate_ssr = 0.0000,
  updated_at = now()
where gacha_code = 'hihen';

update master.m_gacha
set
  rarity_rate_n = 0.7000,
  rarity_rate_r = 0.2000,
  rarity_rate_sr = 0.0700,
  rarity_rate_ur = 0.0300,
  rarity_rate_ssr = 0.0000,
  updated_at = now()
where gacha_code in ('ukanmuri', 'shinnyo');

update master.m_gacha
set
  rarity_rate_n = 0.9100,
  rarity_rate_r = 0.0000,
  rarity_rate_sr = 0.0000,
  rarity_rate_ur = 0.0600,
  rarity_rate_ssr = 0.0300,
  updated_at = now()
where gacha_code = 'kanken1';

-- いったん4ガチャのプールを無効化してから、定義どおりに有効化
update master.m_gacha_piece as gp
set
  is_active = false,
  updated_at = now()
from master.m_gacha as g
where gp.gacha_id = g.gacha_id
  and g.gacha_code in ('hihen', 'ukanmuri', 'shinnyo', 'kanken1');

insert into master.m_gacha_piece (gacha_id, piece_id, weight, is_active)
select
  g.gacha_id,
  p.piece_id,
  pool.weight,
  true
from (
  values
    ('hihen', '歩', 45),
    ('hihen', '金', 25),
    ('hihen', '灯', 15),
    ('hihen', '煽', 10),
    ('hihen', '爆', 5),
    ('ukanmuri', '歩', 45),
    ('ukanmuri', '金', 25),
    ('ukanmuri', '定', 10),
    ('ukanmuri', '安', 10),
    ('ukanmuri', '室', 7),
    ('ukanmuri', '宋', 3),
    ('shinnyo', '歩', 45),
    ('shinnyo', '金', 25),
    ('shinnyo', '辺', 7),
    ('shinnyo', '逸', 10),
    ('shinnyo', '進', 10),
    ('shinnyo', '逃', 3),
    ('kanken1', '歩', 66),
    ('kanken1', '金', 25),
    ('kanken1', '艸', 3),
    ('kanken1', '閹', 3),
    ('kanken1', '膠', 3)
) as pool(gacha_code, kanji, weight)
join master.m_gacha as g on g.gacha_code = pool.gacha_code
join master.m_piece as p on p.kanji = pool.kanji
on conflict (gacha_id, piece_id) do update
set
  weight = excluded.weight,
  is_active = true,
  updated_at = now();

commit;
