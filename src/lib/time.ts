export type PublishableRow = {
  is_active?: boolean | null;
  published_at?: string | null;
  unpublished_at?: string | null;
};

export function isPublishedNow(row: PublishableRow, now = new Date()): boolean {
  if (row.is_active === false) return false;

  const publishedAt = row.published_at ? new Date(row.published_at) : null;
  const unpublishedAt = row.unpublished_at ? new Date(row.unpublished_at) : null;

  if (publishedAt && now < publishedAt) return false;
  if (unpublishedAt && now >= unpublishedAt) return false;
  return true;
}
