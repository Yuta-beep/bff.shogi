import { isAuthorizedInternalRequest } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import {
  recordOnlineMatchResult,
  type OnlineMatchResultInput,
} from '@/services/online-match-result';

export function optionsInternalOnlineMatchResult() {
  return optionsResponse();
}

function isAuthorizedInternal(req: Request): boolean {
  return isAuthorizedInternalRequest(req);
}

export async function postInternalOnlineMatchResult(req: Request) {
  if (!isAuthorizedInternal(req)) {
    return jsonError('UNAUTHORIZED', 'Invalid internal token', 401);
  }

  let body: OnlineMatchResultInput;
  try {
    body = (await req.json()) as OnlineMatchResultInput;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const required = [
    body.matchId,
    body.playerBlackUserId,
    body.playerWhiteUserId,
    body.status,
    body.reason,
    body.startedAt,
    body.finishedAt,
  ];
  if (required.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    return jsonError('INVALID_INPUT', 'Missing required match result fields', 400);
  }
  if (body.status !== 'finished' && body.status !== 'aborted') {
    return jsonError('INVALID_INPUT', 'status must be finished or aborted', 400);
  }

  try {
    const result = await recordOnlineMatchResult(body);
    return jsonOk(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record match result';
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
