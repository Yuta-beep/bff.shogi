import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { getGachaLobby, rollGacha } from '@/services/gacha';
import { resolveUserId } from '@/server/handlers/v1/deck';

export function optionsGacha() {
  return optionsResponse();
}

export async function getGachaLobbyHandler(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const snapshot = await getGachaLobby(userId);
    return jsonOk(snapshot);
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load gacha lobby', 500);
  }
}

type RollBody = {
  gachaId?: unknown;
};

export async function postGachaRollHandler(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  let body: RollBody;
  try {
    body = (await req.json()) as RollBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const gachaId = typeof body.gachaId === 'string' ? body.gachaId.trim() : '';
  if (!gachaId) return jsonError('INVALID_INPUT', 'gachaId is required', 400);

  try {
    const result = await rollGacha(userId, gachaId);
    return jsonOk(result);
  } catch (error: any) {
    const message = String(error?.message ?? '');
    if (message === 'INSUFFICIENT_CURRENCY') {
      return jsonError('INSUFFICIENT_CURRENCY', 'Not enough currency to roll this gacha', 400);
    }
    if (message.includes('not found')) {
      return jsonError('NOT_FOUND', message, 404);
    }
    return jsonError('INTERNAL_ERROR', message || 'Failed to roll gacha', 500);
  }
}
