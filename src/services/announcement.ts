import { supabaseAdmin } from '@/lib/supabase-admin';

export type AnnouncementRow = {
  announcement_id: string;
  title: string;
  contents: string;
  published_at: string;
};

export async function listPublishedAnnouncements(limit = 20): Promise<AnnouncementRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('announcements')
    .select('announcement_id,title,contents,published_at')
    .eq('is_active', true)
    .lte('published_at', now)
    .or(`unpublished_at.is.null,unpublished_at.gt.${now}`)
    .order('published_at', { ascending: false })
    .order('announcement_id', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AnnouncementRow[];
}
