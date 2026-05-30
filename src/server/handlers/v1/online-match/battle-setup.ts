import { isAuthorizedInternalRequest } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { measure } from '@/lib/perf';
import {
  getBattleSetup,
  lockBattleSetup,
  consumeBattleSetup,
  saveBattleSetup,
  validateBattleSetup,
  validatePayload,
  type BattleSetupHandPiece,
  type BattleSetupPlacement,
} from '@/services/online-match-battle-setup';
import { resolveUserId } from '@/server/handlers/v1/deck/index';

type BattleSetupDeps = {
  resolveUserId: typeof resolveUserId;
  saveBattleSetup: typeof saveBattleSetup;
  validateBattleSetup: typeof validateBattleSetup;
  getBattleSetup: typeof getBattleSetup;
  lockBattleSetup: typeof lockBattleSetup;
  consumeBattleSetup: typeof consumeBattleSetup;
};

const defaultDeps: BattleSetupDeps = {
  resolveUserId,
  saveBattleSetup,
  validateBattleSetup,
  getBattleSetup,
  lockBattleSetup,
  consumeBattleSetup,
};

async function resolveBattleSetupUserId(req: Request, deps: BattleSetupDeps) {
  try {
    const authUserId = await deps.resolveUserId(req);
    if (authUserId) return authUserId;
  } catch {
    // Internal server-to-server calls can skip end-user auth and identify the owner explicitly.
  }
  const internalUserId = req.headers.get('x-internal-user-id')?.trim();
  if (internalUserId && !isAuthorizedInternal(req)) return null;
  return internalUserId || null;
}

function isAuthorizedInternal(req: Request): boolean {
  return isAuthorizedInternalRequest(req);
}

type SaveBattleSetupBody = {
  name?: string;
  boardLayout?: BattleSetupPlacement[];
  handsLayout?: BattleSetupHandPiece[];
  selectedPieceIds?: number[];
};

type ParsedSaveBattleSetupBody = {
  name: string | null;
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
};

export function optionsOnlineMatchBattleSetup() {
  return optionsResponse();
}

function parseSaveBody(body: SaveBattleSetupBody): ParsedSaveBattleSetupBody | Response {
  if (
    !Array.isArray(body.boardLayout) ||
    !Array.isArray(body.handsLayout) ||
    !Array.isArray(body.selectedPieceIds)
  ) {
    return jsonError(
      'INVALID_INPUT',
      'boardLayout, handsLayout, selectedPieceIds are required',
      400,
    );
  }
  if (body.name != null) {
    if (typeof body.name !== 'string') {
      return jsonError('INVALID_INPUT', 'name must be a string', 400);
    }
    if (body.name.trim().length > 40) {
      return jsonError('INVALID_INPUT', 'name must be 40 characters or fewer', 400);
    }
  }
  try {
    validatePayload({
      boardLayout: body.boardLayout,
      handsLayout: body.handsLayout,
      selectedPieceIds: body.selectedPieceIds,
    });
  } catch (error: any) {
    return jsonError('INVALID_INPUT', error?.message ?? 'Invalid battle setup payload', 400);
  }
  return {
    name: body.name ?? null,
    boardLayout: body.boardLayout,
    handsLayout: body.handsLayout,
    selectedPieceIds: body.selectedPieceIds,
  };
}

export function createPostBattleSetup(deps: BattleSetupDeps = defaultDeps) {
  return async function postBattleSetup(req: Request) {
    return measure('request.POST /api/v1/online-match/battle-setup', async () => {
      const userId = await measure('request.battleSetup.resolveUserId', () =>
        resolveBattleSetupUserId(req, deps),
      );
      if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

      let body: SaveBattleSetupBody;
      try {
        body = (await req.json()) as SaveBattleSetupBody;
      } catch {
        return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
      }

      const parsed = parseSaveBody(body);
      if (parsed instanceof Response) return parsed;

      try {
        const setup = await measure(
          'request.battleSetup.saveBattleSetup',
          () =>
            deps.saveBattleSetup({
              ownerUserId: userId,
              ...parsed,
            }),
          { userId, selectedPieceCount: parsed.selectedPieceIds.length },
        );
        return jsonOk({ battleSetupId: setup.battleSetupId, status: setup.status });
      } catch (error: any) {
        return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to save battle setup', 500);
      }
    });
  };
}

export function createPostBattleSetupValidate(deps: BattleSetupDeps = defaultDeps) {
  return async function postBattleSetupValidate(
    req: Request,
    context: { params: Promise<{ battleSetupId: string }> },
  ) {
    return measure(
      'request.POST /api/v1/online-match/battle-setup/[battleSetupId]/validate',
      async () => {
        const userId = await measure('request.battleSetupValidate.resolveUserId', () =>
          resolveBattleSetupUserId(req, deps),
        );
        if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);
        const { battleSetupId } = await context.params;

        try {
          const setup = await measure(
            'request.battleSetupValidate.validateBattleSetup',
            () => deps.validateBattleSetup(userId, battleSetupId),
            { userId, battleSetupId },
          );
          return jsonOk({
            battleSetupId: setup.battleSetupId,
            status: setup.status,
            summary: setup.validationSummary,
          });
        } catch (error: any) {
          const message = error?.message ?? 'Failed to validate battle setup';
          const status = message.includes('not found') ? 404 : 400;
          return jsonError(status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', message, status);
        }
      },
    );
  };
}

export function createGetBattleSetup(deps: BattleSetupDeps = defaultDeps) {
  return async function getBattleSetupHandler(
    req: Request,
    context: { params: Promise<{ battleSetupId: string }> },
  ) {
    return measure('request.GET /api/v1/online-match/battle-setup/[battleSetupId]', async () => {
      const userId = await measure('request.battleSetupGet.resolveUserId', () =>
        resolveBattleSetupUserId(req, deps),
      );
      if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);
      const { battleSetupId } = await context.params;

      try {
        const setup = await measure(
          'request.battleSetupGet.getBattleSetup',
          () => deps.getBattleSetup(userId, battleSetupId),
          { userId, battleSetupId },
        );
        return jsonOk(setup);
      } catch (error: any) {
        return jsonError('NOT_FOUND', error?.message ?? 'Battle setup not found', 404);
      }
    });
  };
}

export function createPostBattleSetupLock(deps: BattleSetupDeps = defaultDeps) {
  return async function postBattleSetupLock(
    req: Request,
    context: { params: Promise<{ battleSetupId: string }> },
  ) {
    return measure(
      'request.POST /api/v1/online-match/battle-setup/[battleSetupId]/lock',
      async () => {
        const userId = await measure('request.battleSetupLock.resolveUserId', () =>
          resolveBattleSetupUserId(req, deps),
        );
        if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);
        const { battleSetupId } = await context.params;

        try {
          const setup = await measure(
            'request.battleSetupLock.lockBattleSetup',
            () => deps.lockBattleSetup(userId, battleSetupId),
            { userId, battleSetupId },
          );
          return jsonOk({ battleSetupId: setup.battleSetupId, status: setup.status });
        } catch (error: any) {
          const message = error?.message ?? 'Failed to lock battle setup';
          const status = message.includes('not found') ? 404 : 400;
          return jsonError(status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', message, status);
        }
      },
    );
  };
}

export function createPostBattleSetupConsume(deps: BattleSetupDeps = defaultDeps) {
  return async function postBattleSetupConsume(
    req: Request,
    context: { params: Promise<{ battleSetupId: string }> },
  ) {
    return measure(
      'request.POST /api/v1/online-match/battle-setup/[battleSetupId]/consume',
      async () => {
        const userId = await measure('request.battleSetupConsume.resolveUserId', () =>
          resolveBattleSetupUserId(req, deps),
        );
        if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);
        const { battleSetupId } = await context.params;

        try {
          const setup = await measure(
            'request.battleSetupConsume.consumeBattleSetup',
            () => deps.consumeBattleSetup(userId, battleSetupId),
            { userId, battleSetupId },
          );
          return jsonOk({ battleSetupId: setup.battleSetupId, status: setup.status });
        } catch (error: any) {
          const message = error?.message ?? 'Failed to consume battle setup';
          const status = message.includes('not found') ? 404 : 400;
          return jsonError(status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', message, status);
        }
      },
    );
  };
}

export const postBattleSetup = createPostBattleSetup();
export const postBattleSetupValidate = createPostBattleSetupValidate();
export const getBattleSetupHandler = createGetBattleSetup();
export const postBattleSetupLock = createPostBattleSetupLock();
export const postBattleSetupConsume = createPostBattleSetupConsume();
