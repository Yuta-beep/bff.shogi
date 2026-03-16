import { describe, expect, it } from 'bun:test';

import { CommitGameMoveError } from '@/services/game-move';
import { createGetGameLegalMoves } from '../games/legal-moves';
import { readJson } from './test-utils';

describe('GET /api/v1/games/:gameId/legal-moves', () => {
  it('returns 200 with legal moves on success', async () => {
    const handler = createGetGameLegalMoves({
      loadGameLegalMoves: async () =>
        ({
          sideToMove: 'player',
          moveNo: 3,
          stateHash: 'hash-1',
          legalMoves: [
            {
              fromRow: 6,
              fromCol: 4,
              toRow: 5,
              toCol: 4,
              pieceCode: 'FU',
              promote: false,
              dropPieceCode: null,
              capturedPieceCode: null,
              notation: null,
            },
          ],
        }) as any,
    });

    const response = await handler('game-1');
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data.moveNo).toBe(3);
    expect(payload.data.legalMoves[0]?.pieceCode).toBe('FU');
  });

  it('maps missing games to 404', async () => {
    const handler = createGetGameLegalMoves({
      loadGameLegalMoves: async () => {
        throw new CommitGameMoveError('GAME_NOT_FOUND', 'missing');
      },
    });

    const response = await handler('game-404');
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('GAME_NOT_FOUND');
  });
});
