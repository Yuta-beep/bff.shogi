import { getAnnouncements, optionsAnnouncements } from '@/server/handlers/v1/announcements';

export const runtime = 'nodejs';

export const OPTIONS = optionsAnnouncements;
export const GET = getAnnouncements;
