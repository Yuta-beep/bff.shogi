import { optionsStageSelect, postStageSelect } from '@/server/handlers/v1/stages/select';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageSelect;

export async function POST(req: Request, context: { params: Promise<{ stageNo: string }> | { stageNo: string } }) {
  const params = await Promise.resolve(context.params);
  return postStageSelect(params.stageNo);
}
