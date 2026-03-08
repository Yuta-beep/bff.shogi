import { getStageList, optionsStageList } from '@/server/handlers/v1/stages/list';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageList;
export const GET = getStageList;
