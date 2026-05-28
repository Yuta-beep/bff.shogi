-- 対人レート: 新規サインアップ時は必ず 0（DB default に依存しない）

alter table public.players
  alter column rating set default 0;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.players (id, rating)
  values (new.id, 0)
  on conflict (id) do nothing;

  perform public.seed_initial_owned_pieces(new.id);

  perform public.ensure_default_my_deck_for_user(new.id);

  return new;
end;
$$;
