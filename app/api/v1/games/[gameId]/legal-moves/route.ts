import { getGameLegalMoves, optionsGameLegalMoves } from '@/server/handlers/v1/games/legal-moves';

export const runtime = 'nodejs';

export const OPTIONS = optionsGameLegalMoves;

export async function GET(_req: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  return getGameLegalMoves(gameId);
}
