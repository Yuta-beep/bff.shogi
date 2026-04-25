import {
  optionsStageBattleStart,
  postStageBattleStart,
} from '@/server/handlers/v1/stage-battles/start';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageBattleStart;
export const POST = postStageBattleStart;
