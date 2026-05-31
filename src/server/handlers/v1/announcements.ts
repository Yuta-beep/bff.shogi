import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { listPublishedAnnouncements } from '@/services/announcement';

type AnnouncementDeps = {
  listPublishedAnnouncements: typeof listPublishedAnnouncements;
};

export function optionsAnnouncements() {
  return optionsResponse();
}

export function createGetAnnouncements(deps: AnnouncementDeps = { listPublishedAnnouncements }) {
  return async function getAnnouncements() {
    try {
      const announcements = await deps.listPublishedAnnouncements();

      return jsonOk({
        announcements: announcements.map((row) => ({
          id: row.announcement_id,
          title: row.title,
          contents: row.contents,
          publishedAt: row.published_at,
        })),
      });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load announcements', 500);
    }
  };
}

export const getAnnouncements = createGetAnnouncements();
