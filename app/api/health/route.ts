import { getHealth, optionsHealth } from '@/server/handlers/health';

export const runtime = 'nodejs';

export const OPTIONS = optionsHealth;
export const GET = getHealth;
