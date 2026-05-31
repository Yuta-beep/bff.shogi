insert into public.announcements (
  announcement_id,
  title,
  contents,
  is_active,
  published_at,
  unpublished_at
)
values (
  'test-announcement-20260531',
  'テストのお知らせ',
  'これは表示確認用のテストお知らせです。',
  true,
  now(),
  null
)
on conflict (announcement_id) do update
set
  title = excluded.title,
  contents = excluded.contents,
  is_active = excluded.is_active,
  published_at = excluded.published_at,
  unpublished_at = excluded.unpublished_at,
  updated_at = now();
