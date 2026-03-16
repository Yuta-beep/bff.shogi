import { optionsGameMove, postGameMove } from '@/server/handlers/v1/games/moves';

export const runtime = 'nodejs';

export const OPTIONS = optionsGameMove;

export async function POST(req: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  return postGameMove(gameId, req);
}
