import {
  optionsStageBattleFinish,
  postStageBattleFinish,
} from '@/server/handlers/v1/stage-battles/finish';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageBattleFinish;
export const POST = postStageBattleFinish;
