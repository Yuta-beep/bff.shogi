-- ガチャ1回の消費通貨: うかんむり・ひへん・しんにょう=歩10、漢検1級=金2
update master.m_gacha
set
  pawn_cost = case
    when gacha_code = 'kanken1' then 0
    else 10
  end,
  gold_cost = case
    when gacha_code = 'kanken1' then 2
    else 0
  end,
  updated_at = now()
where gacha_code in ('hihen', 'ukanmuri', 'shinnyo', 'kanken1');
