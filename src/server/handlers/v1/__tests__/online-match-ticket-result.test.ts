import { describe, expect, it } from 'bun:test';

import { createPostOnlineMatchTicket } from '../online-match/ticket';
import { postInternalOnlineMatchResult } from '../internal/online-match-result';
import { jsonRequest, readJson } from './test-utils';

describe('online match ticket handler', () => {
  it('issues a matchmaking ticket for an authenticated user', async () => {
    const handler = createPostOnlineMatchTicket({
      resolveUserId: async () => 'user-1',
      issueMatchmakingTicket: async (userId: string) => ({
        ticket: 'payload.signature',
        expiresAt: '2026-01-01T00:02:00.000Z',
        user: { userId, displayName: 'Alice', rating: 1500 },
      }),
    });

    const response = await handler(new Request('http://localhost'));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data.ticket).toBe('payload.signature');
    expect(payload.data.user.userId).toBe('user-1');
  });

  it('rejects missing auth', async () => {
    const handler = createPostOnlineMatchTicket({
      resolveUserId: async () => null,
      issueMatchmakingTicket: async () => {
        throw new Error('should not be called');
      },
    });

    const response = await handler(new Request('http://localhost'));

    expect(response.status).toBe(401);
  });
});

describe('internal online match result handler', () => {
  it('rejects calls without the internal token', async () => {
    const response = await postInternalOnlineMatchResult(
      jsonRequest('http://localhost/api/v1/internal/online-match/result', {
        matchId: 'match-1',
        playerBlackUserId: 'user-1',
        playerWhiteUserId: 'user-2',
        winnerUserId: 'user-1',
        status: 'finished',
        reason: 'resign',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:10:00.000Z',
      }),
    );

    expect(response.status).toBe(401);
  });
});
