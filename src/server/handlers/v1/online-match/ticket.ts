import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { measure } from '@/lib/perf';
import { resolveUserId } from '@/server/handlers/v1/deck/index';
import { issueMatchmakingTicket } from '@/services/matchmaking-ticket';

type TicketDeps = {
  resolveUserId: typeof resolveUserId;
  issueMatchmakingTicket: typeof issueMatchmakingTicket;
};

const defaultDeps: TicketDeps = {
  resolveUserId,
  issueMatchmakingTicket,
};

export function optionsOnlineMatchTicket() {
  return optionsResponse();
}

export function createPostOnlineMatchTicket(deps: TicketDeps = defaultDeps) {
  return async function postOnlineMatchTicket(req: Request) {
    return measure('request.POST /api/v1/online-match/ticket', async () => {
      const userId = await measure('request.onlineMatchTicket.resolveUserId', () =>
        deps.resolveUserId(req),
      );
      if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

      try {
        const ticket = await measure(
          'request.onlineMatchTicket.issueMatchmakingTicket',
          () => deps.issueMatchmakingTicket(userId),
          { userId },
        );
        return jsonOk(ticket);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to issue matchmaking ticket';
        const code = message.includes('not found') ? 'PLAYER_NOT_FOUND' : 'INTERNAL_ERROR';
        return jsonError(code, message, code === 'PLAYER_NOT_FOUND' ? 404 : 500);
      }
    });
  };
}

export const postOnlineMatchTicket = createPostOnlineMatchTicket();
