import { getBattleSetup, optionsBattleSetup } from '@/server/handlers/v1/stages/battle-setup';

export const runtime = 'nodejs';

export const OPTIONS = optionsBattleSetup;

export async function GET(req: Request, context: { params: Promise<{ stageNo: string }> | { stageNo: string } }) {
  const params = await Promise.resolve(context.params);
  return getBattleSetup(params.stageNo);
}
