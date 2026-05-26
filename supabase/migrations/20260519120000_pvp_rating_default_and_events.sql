-- 対人レート: 新規プレイヤーは 0 から開始。同一対局の二重加算を防ぐイベント表。

alter table public.players
  alter column rating set default 0;

create table if not exists public.player_pvp_rating_events (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references public.players(id) on delete cascade,
  match_id      text        not null,
  won           boolean     not null,
  delta         int         not null,
  rating_after  int         not null,
  created_at    timestamptz not null default now(),
  constraint player_pvp_rating_events_player_match_unique unique (player_id, match_id),
  constraint player_pvp_rating_events_rating_after_chk check (rating_after >= 0)
);

create index if not exists player_pvp_rating_events_player_id_idx
  on public.player_pvp_rating_events (player_id);

alter table public.player_pvp_rating_events enable row level security;

-- BFF は service role のみアクセス（RLS バイパス）
