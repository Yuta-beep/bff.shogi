import { describe, expect, it } from 'bun:test';

import { createGetAnnouncements } from '../announcements';
import { readJson } from './test-utils';

describe('GET /api/v1/announcements', () => {
  it('returns published announcements in app-facing shape', async () => {
    const handler = createGetAnnouncements({
      listPublishedAnnouncements: async () => [
        {
          announcement_id: 'test-announcement',
          title: 'テストのお知らせ',
          contents: 'これはテストです。',
          published_at: '2026-05-31T00:00:00.000Z',
        },
      ],
    });

    const response = await handler();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        announcements: [
          {
            id: 'test-announcement',
            title: 'テストのお知らせ',
            contents: 'これはテストです。',
            publishedAt: '2026-05-31T00:00:00.000Z',
          },
        ],
      },
    });
  });
});
