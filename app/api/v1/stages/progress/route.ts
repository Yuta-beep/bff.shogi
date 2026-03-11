import { getStageProgress, optionsStageProgress } from '@/server/handlers/v1/stages/progress';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageProgress;
export const GET = getStageProgress;
