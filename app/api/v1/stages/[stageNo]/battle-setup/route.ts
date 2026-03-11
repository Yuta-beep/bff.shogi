import { getBattleSetup, optionsBattleSetup } from '@/server/handlers/v1/stages/battle-setup';

export const runtime = 'nodejs';

export const OPTIONS = optionsBattleSetup;

export async function GET(req: Request, context: { params: Promise<{ stageNo: string }> }) {
  const { stageNo } = await context.params;
  return getBattleSetup(stageNo, req);
}
