-- Stage 39 (鬼ヶ島): set enemy Oni colors by position.
-- Leftmost enemy Oni -> blueOni, rightmost enemy Oni -> blackOni.
with stage39 as (
  select stage_id
  from master.m_stage
  where stage_no = 39
  limit 1
),
targets as (
  select
    p.stage_id,
    p.side,
    p.row_no,
    p.col_no,
    row_number() over (order by p.col_no asc, p.row_no asc) as left_rank,
    row_number() over (order by p.col_no desc, p.row_no desc) as right_rank
  from master.m_stage_initial_placement p
  join stage39 s on s.stage_id = p.stage_id
  join master.m_piece piece on piece.piece_id = p.piece_id
  where p.side = 'enemy'
    and piece.kanji = '鬼'
),
piece_ids as (
  select
    max(case when piece_code = 'blueOni' then piece_id end) as blue_piece_id,
    max(case when piece_code = 'blackOni' then piece_id end) as black_piece_id
  from master.m_piece
)
update master.m_stage_initial_placement p
set piece_id = case
  when t.left_rank = 1 then ids.blue_piece_id
  when t.right_rank = 1 then ids.black_piece_id
  else p.piece_id
end
from targets t
cross join piece_ids ids
where p.stage_id = t.stage_id
  and p.side = t.side
  and p.row_no = t.row_no
  and p.col_no = t.col_no
  and (
    (t.left_rank = 1 and ids.blue_piece_id is not null)
    or (t.right_rank = 1 and ids.black_piece_id is not null)
  );
