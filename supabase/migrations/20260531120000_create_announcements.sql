begin;

create table if not exists public.announcements (
  announcement_id text primary key,
  contents text not null,
  is_active boolean not null default true,
  published_at timestamptz not null,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_contents_len_chk
    check (char_length(contents) between 1 and 4000),
  constraint announcements_publish_window_chk
    check (unpublished_at is null or unpublished_at > published_at)
);

create index if not exists announcements_published_idx
  on public.announcements(published_at desc, announcement_id)
  where is_active = true and unpublished_at is null;

create index if not exists announcements_active_window_idx
  on public.announcements(is_active, published_at desc, unpublished_at);

alter table public.announcements enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'announcements'
      and policyname = 'announcements: public read published'
  ) then
    create policy "announcements: public read published"
      on public.announcements for select
      using (
        is_active = true
        and published_at <= now()
        and (unpublished_at is null or unpublished_at > now())
      );
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
