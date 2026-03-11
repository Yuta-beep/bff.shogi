import { optionsStageClear, postStageClear } from '@/server/handlers/v1/stages/clear';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageClear;

export async function POST(req: Request, context: { params: Promise<{ stageNo: string }> }) {
  const { stageNo } = await context.params;
  return postStageClear(stageNo, req);
}
