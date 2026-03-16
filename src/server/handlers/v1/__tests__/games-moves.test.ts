import { describe, expect, it } from 'bun:test';

import { CommitGameMoveError } from '@/services/game-move';
import { createPostGameMove } from '../games/moves';
import { invalidJsonRequest, jsonRequest, readJson } from './test-utils';

describe('POST /api/v1/games/:gameId/moves', () => {
  it('returns 400 for invalid JSON', async () => {
    const handler = createPostGameMove({
      parseGameMoveRequest: () => ({}) as any,
      commitGameMove: async () => ({}) as any,
    });
    const response = await handler(
      'game-1',
      invalidJsonRequest('http://localhost/api/v1/games/game-1/moves'),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_JSON');
  });

  it('returns 200 with canonical position on success', async () => {
    const handler = createPostGameMove({
      parseGameMoveRequest: (body) => body as any,
      commitGameMove: async () =>
        ({
          moveNo: 1,
          actorSide: 'player',
          move: { pieceCode: 'FU', fromRow: 6, fromCol: 4, toRow: 5, toCol: 4 },
          position: {
            sideToMove: 'enemy',
            turnNumber: 2,
            moveCount: 1,
            sfen: 'x',
            stateHash: null,
            boardState: {},
            hands: {},
          },
          game: { status: 'in_progress', result: null, winnerSide: null },
        }) as any,
    });

    const response = await handler(
      'game-1',
      jsonRequest('http://localhost/api/v1/games/game-1/moves', {
        moveNo: 1,
        actorSide: 'player',
        move: { pieceCode: 'FU', fromRow: 6, fromCol: 4, toRow: 5, toCol: 4 },
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data.position.sideToMove).toBe('enemy');
    expect(payload.data.moveNo).toBe(1);
  });

  it('maps commit conflicts to 409', async () => {
    const handler = createPostGameMove({
      parseGameMoveRequest: (body) => body as any,
      commitGameMove: async () => {
        throw new CommitGameMoveError('TURN_MISMATCH', 'not your turn');
      },
    });

    const response = await handler(
      'game-1',
      jsonRequest('http://localhost/api/v1/games/game-1/moves', {
        moveNo: 1,
        actorSide: 'player',
        move: { pieceCode: 'FU', fromRow: 6, fromCol: 4, toRow: 5, toCol: 4 },
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('TURN_MISMATCH');
  });
});
