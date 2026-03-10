import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { normalizeEngineConfig } from '@/lib/engine-config';
import { requestAiMove } from '@/lib/ai-engine-client';
import { persistAiTurn } from '@/services/game-runtime';

export async function executeAiTurn(input: AiMoveRequest) {
  const normalizedConfig = normalizeEngineConfig(input.engineConfig);
  const response = await requestAiMove({
    ...input,
    engineConfig: normalizedConfig,
  });

  await persistAiTurn({
    request: input,
    normalizedConfig,
    response,
  });

  return response;
}
