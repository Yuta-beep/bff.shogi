begin;

create extension if not exists pgcrypto;

create table if not exists public.stage_battle_sessions (
  battle_session_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  stage_id bigint not null references master.m_stage(stage_id) on delete cascade,
  status text not null default 'in_progress',
  result text,
  client_version text,
  initial_snapshot jsonb not null default '{}'::jsonb,
  finish_payload jsonb not null default '{}'::jsonb,
  finish_summary jsonb,
  final_snapshot_hash text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  reward_granted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint stage_battle_sessions_status_chk
    check (status in ('in_progress', 'finished', 'expired')),
  constraint stage_battle_sessions_result_chk
    check (result is null or result in ('cleared', 'failed')),
  constraint stage_battle_sessions_finish_order_chk
    check (finished_at is null or finished_at >= started_at),
  constraint stage_battle_sessions_expire_order_chk
    check (expires_at > started_at)
);

create index if not exists stage_battle_sessions_player_status_idx
  on public.stage_battle_sessions(player_id, status, started_at desc);

create index if not exists stage_battle_sessions_stage_idx
  on public.stage_battle_sessions(stage_id, started_at desc);

alter table public.stage_battle_sessions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stage_battle_sessions'
      and policyname = 'stage_battle_sessions: self read'
  ) then
    create policy "stage_battle_sessions: self read"
      on public.stage_battle_sessions for select
      using (auth.uid() = player_id);
  end if;
end
$$;

create or replace function public.finish_stage_battle_session(
  p_session_id uuid,
  p_player_id uuid,
  p_result text,
  p_final_snapshot_hash text default null,
  p_finish_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, master
as $$
declare
  v_session public.stage_battle_sessions%rowtype;
  v_stage_no integer;
  v_first_clear boolean := false;
  v_clear_count integer := 0;
  v_pawn integer := 0;
  v_gold integer := 0;
  v_wallet_pawn integer := 0;
  v_wallet_gold integer := 0;
  v_granted_pieces jsonb := '[]'::jsonb;
  v_summary jsonb;
begin
  if p_result not in ('cleared', 'failed') then
    raise exception 'INVALID_RESULT'
      using errcode = 'P0001';
  end if;

  select *
  into v_session
  from public.stage_battle_sessions
  where battle_session_id = p_session_id
    and player_id = p_player_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_session.status = 'finished' then
    return coalesce(
      v_session.finish_summary,
      jsonb_build_object(
        'battleSessionId', v_session.battle_session_id,
        'status', v_session.status,
        'result', v_session.result
      )
    );
  end if;

  if v_session.status = 'expired' or v_session.expires_at <= now() then
    update public.stage_battle_sessions
    set
      status = 'expired',
      updated_at = now()
    where battle_session_id = v_session.battle_session_id;

    raise exception 'SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  select s.stage_no
  into v_stage_no
  from master.m_stage s
  where s.stage_id = v_session.stage_id;

  if p_result = 'cleared' then
    update public.player_stage_clears
    set
      clear_count = player_stage_clears.clear_count + 1,
      cleared_at = now(),
      updated_at = now()
    where player_id = p_player_id
      and stage_id = v_session.stage_id
    returning clear_count into v_clear_count;

    if not found then
      insert into public.player_stage_clears (
        player_id,
        stage_id,
        clear_count,
        cleared_at,
        updated_at
      )
      values (
        p_player_id,
        v_session.stage_id,
        1,
        now(),
        now()
      );
      v_first_clear := true;
      v_clear_count := 1;
    end if;

    with eligible_rewards as (
      select
        sr.quantity,
        r.reward_type,
        r.item_code,
        r.piece_id
      from master.m_stage_reward sr
      join master.m_reward r
        on r.reward_id = sr.reward_id
      where sr.stage_id = v_session.stage_id
        and sr.is_active = true
        and r.is_active = true
        and (
          sr.reward_timing = 'clear'
          or (v_first_clear and sr.reward_timing = 'first_clear')
        )
        and (r.published_at is null or r.published_at <= now())
        and (r.unpublished_at is null or r.unpublished_at > now())
    )
    select
      coalesce(sum(case when reward_type = 'currency' and item_code = 'pawn' then quantity else 0 end), 0),
      coalesce(sum(case when reward_type = 'currency' and item_code = 'gold' then quantity else 0 end), 0)
    into v_pawn, v_gold
    from eligible_rewards;

    update public.players
    set
      pawn_currency = players.pawn_currency + v_pawn,
      gold_currency = players.gold_currency + v_gold,
      updated_at = now()
    where id = p_player_id
    returning pawn_currency, gold_currency into v_wallet_pawn, v_wallet_gold;

    with piece_rewards as (
      select
        r.piece_id,
        sum(sr.quantity)::integer as qty
      from master.m_stage_reward sr
      join master.m_reward r
        on r.reward_id = sr.reward_id
      where sr.stage_id = v_session.stage_id
        and sr.is_active = true
        and r.is_active = true
        and r.reward_type = 'piece'
        and r.piece_id is not null
        and (
          sr.reward_timing = 'clear'
          or (v_first_clear and sr.reward_timing = 'first_clear')
        )
        and (r.published_at is null or r.published_at <= now())
        and (r.unpublished_at is null or r.unpublished_at > now())
      group by r.piece_id
    )
    insert into public.player_owned_pieces (
      player_id,
      piece_id,
      source,
      quantity,
      acquired_at
    )
    select
      p_player_id,
      pr.piece_id,
      'stage_clear',
      pr.qty,
      now()
    from piece_rewards pr
    on conflict (player_id, piece_id) do update
    set
      quantity = public.player_owned_pieces.quantity + excluded.quantity,
      source = 'stage_clear';

    with piece_rewards as (
      select
        r.piece_id,
        sum(sr.quantity)::integer as qty
      from master.m_stage_reward sr
      join master.m_reward r
        on r.reward_id = sr.reward_id
      where sr.stage_id = v_session.stage_id
        and sr.is_active = true
        and r.is_active = true
        and r.reward_type = 'piece'
        and r.piece_id is not null
        and (
          sr.reward_timing = 'clear'
          or (v_first_clear and sr.reward_timing = 'first_clear')
        )
        and (r.published_at is null or r.published_at <= now())
        and (r.unpublished_at is null or r.unpublished_at > now())
      group by r.piece_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pieceId', p.piece_id,
          'char', p.kanji,
          'name', p.name,
          'quantity', pr.qty
        )
        order by p.piece_id
      ),
      '[]'::jsonb
    )
    into v_granted_pieces
    from piece_rewards pr
    join master.m_piece p
      on p.piece_id = pr.piece_id;
  else
    select pawn_currency, gold_currency
    into v_wallet_pawn, v_wallet_gold
    from public.players
    where id = p_player_id;
  end if;

  v_summary := jsonb_build_object(
    'battleSessionId', v_session.battle_session_id,
    'status', 'finished',
    'result', p_result,
    'stageNo', v_stage_no,
    'clearApplied', (p_result = 'cleared'),
    'firstClear', v_first_clear,
    'clearCount', case when p_result = 'cleared' then to_jsonb(v_clear_count) else 'null'::jsonb end,
    'granted', jsonb_build_object(
      'pawn', v_pawn,
      'gold', v_gold,
      'pieces', v_granted_pieces
    ),
    'wallet', jsonb_build_object(
      'pawnCurrency', coalesce(v_wallet_pawn, 0),
      'goldCurrency', coalesce(v_wallet_gold, 0)
    )
  );

  update public.stage_battle_sessions
  set
    status = 'finished',
    result = p_result,
    finish_payload = coalesce(p_finish_payload, '{}'::jsonb),
    finish_summary = v_summary,
    final_snapshot_hash = p_final_snapshot_hash,
    reward_granted_at = case when p_result = 'cleared' then now() else null end,
    finished_at = now(),
    updated_at = now()
  where battle_session_id = v_session.battle_session_id;

  return v_summary;
end;
$$;

commit;
