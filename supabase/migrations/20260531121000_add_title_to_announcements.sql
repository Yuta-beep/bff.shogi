begin;

alter table public.announcements
  add column if not exists title text not null default 'お知らせ';

alter table public.announcements
  add constraint announcements_title_len_chk
    check (char_length(title) between 1 and 120);

notify pgrst, 'reload schema';

commit;
