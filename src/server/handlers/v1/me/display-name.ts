import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { measure } from '@/lib/perf';
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
  return resolveBearerUserId(req);
}

export function createGetMeDisplayName(
  deps: GetMeDisplayNameDeps = { resolveUserId, getPlayerDisplayName },
) {
  return async function getMeDisplayName(req: Request) {
    return measure('request.GET /api/v1/me/display-name', async () => {
      const userId = await measure('request.displayName.resolveUserId', () =>
        deps.resolveUserId(req),
      );
      if (!userId) {
        return jsonError('UNAUTHORIZED', 'Authentication required', 401);
      }

      try {
        const displayName = await measure(
          'request.displayName.getPlayerDisplayName',
          () => deps.getPlayerDisplayName(userId),
          { userId },
        );
        return jsonOk({ displayName });
      } catch (error: any) {
        return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load display name', 500);
      }
    });
  };
}

type PutBody = {
  displayName?: unknown;
};

export function createPutMeDisplayName(
  deps: PutMeDisplayNameDeps = { resolveUserId, upsertPlayerDisplayName },
) {
  return async function putMeDisplayName(req: Request) {
    return measure('request.PUT /api/v1/me/display-name', async () => {
      const userId = await measure('request.displayName.resolveUserId', () =>
        deps.resolveUserId(req),
      );
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
      if (displayName.length > 20) {
        return jsonError('INVALID_INPUT', 'displayName must be 20 characters or fewer', 400);
      }

      try {
        await measure(
          'request.displayName.upsertPlayerDisplayName',
          () => deps.upsertPlayerDisplayName(userId, displayName),
          { userId },
        );
        return jsonOk({ displayName });
      } catch (error: any) {
        return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to update display name', 500);
      }
    });
  };
}

export const getMeDisplayName = createGetMeDisplayName();
export const putMeDisplayName = createPutMeDisplayName();
