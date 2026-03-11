import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPlayerDisplayName, upsertPlayerDisplayName } from '@/services/player-profile';

export function optionsMeDisplayName() {
  return optionsResponse();
}

type GetMeDisplayNameDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  getPlayerDisplayName: typeof getPlayerDisplayName;
};

type PutMeDisplayNameDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  upsertPlayerDisplayName: typeof upsertPlayerDisplayName;
};

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function createGetMeDisplayName(
  deps: GetMeDisplayNameDeps = { resolveUserId, getPlayerDisplayName },
) {
  return async function getMeDisplayName(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    try {
      const displayName = await deps.getPlayerDisplayName(userId);
      return jsonOk({ displayName });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load display name', 500);
    }
  };
}

type PutBody = {
  displayName?: unknown;
};

export function createPutMeDisplayName(
  deps: PutMeDisplayNameDeps = { resolveUserId, upsertPlayerDisplayName },
) {
  return async function putMeDisplayName(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    let body: PutBody;
    try {
      body = (await req.json()) as PutBody;
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
    }

    const raw = typeof body.displayName === 'string' ? body.displayName : '';
    const displayName = raw.trim();
    if (!displayName) {
      return jsonError('INVALID_INPUT', 'displayName is required', 400);
    }

    try {
      await deps.upsertPlayerDisplayName(userId, displayName);
      return jsonOk({ displayName });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to update display name', 500);
    }
  };
}

export const getMeDisplayName = createGetMeDisplayName();
export const putMeDisplayName = createPutMeDisplayName();
