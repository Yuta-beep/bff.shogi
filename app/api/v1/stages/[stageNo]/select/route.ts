import { optionsStageSelect, postStageSelect } from '@/server/handlers/v1/stages/select';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageSelect;

export async function POST(_req: Request, context: { params: Promise<{ stageNo: string }> }) {
  const { stageNo } = await context.params;
  return postStageSelect(stageNo);
}
