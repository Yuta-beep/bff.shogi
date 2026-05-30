begin;

create table if not exists public.online_match_battle_setups (
  battle_setup_id text primary key,
  owner_user_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'draft',
  name text,
  board_layout jsonb not null default '[]'::jsonb,
  hands_layout jsonb not null default '[]'::jsonb,
  selected_piece_ids jsonb not null default '[]'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint online_match_battle_setups_status_chk
    check (status in ('draft', 'validated', 'locked', 'consumed')),
  constraint online_match_battle_setups_name_len_chk
    check (name is null or char_length(name) between 1 and 40),
  constraint online_match_battle_setups_board_array_chk
    check (jsonb_typeof(board_layout) = 'array'),
  constraint online_match_battle_setups_hands_array_chk
    check (jsonb_typeof(hands_layout) = 'array'),
  constraint online_match_battle_setups_selected_piece_ids_array_chk
    check (jsonb_typeof(selected_piece_ids) = 'array'),
  constraint online_match_battle_setups_validation_summary_object_chk
    check (jsonb_typeof(validation_summary) = 'object')
);

create index if not exists online_match_battle_setups_owner_status_idx
  on public.online_match_battle_setups(owner_user_id, status, updated_at desc);

create index if not exists online_match_battle_setups_expires_idx
  on public.online_match_battle_setups(updated_at)
  where status in ('draft', 'validated', 'locked');

alter table public.online_match_battle_setups enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_match_battle_setups'
      and policyname = 'online_match_battle_setups: self read'
  ) then
    create policy "online_match_battle_setups: self read"
      on public.online_match_battle_setups for select
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_match_battle_setups'
      and policyname = 'online_match_battle_setups: self insert'
  ) then
    create policy "online_match_battle_setups: self insert"
      on public.online_match_battle_setups for insert
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_match_battle_setups'
      and policyname = 'online_match_battle_setups: self update'
  ) then
    create policy "online_match_battle_setups: self update"
      on public.online_match_battle_setups for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
