import { parseAiMoveRequest, AiMoveRequestValidationError } from '@/lib/ai-move-request-parser';
import { AiEngineConnectionError, AiEngineHttpError } from '@/lib/ai-engine-errors';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { executeAiTurn } from '@/services/ai-turn';

type PostAiMoveDeps = {
  parseAiMoveRequest: typeof parseAiMoveRequest;
  executeAiTurn: typeof executeAiTurn;
};

export function optionsAiMove() {
  return optionsResponse();
}

export function createPostAiMove(deps: PostAiMoveDeps = { parseAiMoveRequest, executeAiTurn }) {
  return async function postAiMove(req: Request) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    try {
      const input = deps.parseAiMoveRequest(body);
      const result = await deps.executeAiTurn(input);
      return jsonOk(result);
    } catch (error: any) {
      if (error instanceof AiMoveRequestValidationError) {
        return jsonError('INVALID_REQUEST', error.message, 400);
      }

      if (error?.message?.startsWith?.('GAME_NOT_FOUND:')) {
        return jsonError('GAME_NOT_FOUND', error.message, 404);
      }

      if (error instanceof AiEngineHttpError) {
        if (error.status >= 400 && error.status < 500) {
          return jsonError('AI_ENGINE_BAD_REQUEST', error.body || error.message, error.status);
        }
        return jsonError('AI_ENGINE_UPSTREAM', error.body || error.message, 502);
      }

      if (error instanceof AiEngineConnectionError) {
        return jsonError('AI_ENGINE_UNREACHABLE', error.message, 502);
      }

      return jsonError('ENGINE_INTERNAL', error?.message ?? 'Failed to get AI move', 500);
    }
  };
}

export const postAiMove = createPostAiMove();
