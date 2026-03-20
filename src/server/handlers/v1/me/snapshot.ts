import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPlayerSnapshot } from '@/services/player-profile';

export function optionsMeSnapshot() {
  return optionsResponse();
}

type GetMeSnapshotDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  getPlayerSnapshot: typeof getPlayerSnapshot;
};

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function createGetMeSnapshot(
  deps: GetMeSnapshotDeps = { resolveUserId, getPlayerSnapshot },
) {
  return async function getMeSnapshot(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    try {
      const snapshot = await deps.getPlayerSnapshot(userId);
      if (!snapshot) {
        return jsonError('PLAYER_NOT_FOUND', 'Player profile not found', 404);
      }

      return jsonOk({
        playerName: snapshot.displayName ?? '',
        rating: snapshot.rating,
        pawnCurrency: snapshot.pawnCurrency,
        goldCurrency: snapshot.goldCurrency,
        playerRank: snapshot.playerRank,
        playerExp: snapshot.playerExp,
        stamina: snapshot.stamina,
        maxStamina: snapshot.maxStamina,
      });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load player snapshot', 500);
    }
  };
}

export const getMeSnapshot = createGetMeSnapshot();
