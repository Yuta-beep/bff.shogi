import { jsonError } from '@/lib/http';
import { getBattleSetup, optionsBattleSetup } from '@/server/handlers/v1/stages/battle-setup';

export const runtime = 'nodejs';

export const OPTIONS = optionsBattleSetup;

export async function GET(req: Request, context: { params: Promise<{ stageNo: string }> }) {
  try {
    const { stageNo } = await context.params;
    return await getBattleSetup(stageNo, req);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unexpected error';
    console.error('[GET /api/v1/stages/[stageNo]/battle-setup]', error);
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
