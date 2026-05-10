import {
  optionsOnlineMatchBattleSetup,
  postBattleSetup,
} from '@/server/handlers/v1/online-match/battle-setup';

export const runtime = 'nodejs';

export const OPTIONS = optionsOnlineMatchBattleSetup;
export const POST = postBattleSetup;
