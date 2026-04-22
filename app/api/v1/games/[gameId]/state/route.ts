import { getGameState, optionsGameState } from '@/server/handlers/v1/games/state';

export const runtime = 'nodejs';

export const OPTIONS = optionsGameState;

export async function GET(_req: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  return getGameState(gameId);
}
