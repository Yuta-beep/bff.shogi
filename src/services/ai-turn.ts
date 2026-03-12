import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { normalizeEngineConfig } from '@/lib/engine-config';
import { requestAiMove } from '@/lib/ai-engine-client';
import { attachSkillEffectsToAiRequest } from '@/services/ai-skill-effects';
import { persistAiTurn } from '@/services/game-runtime';

export async function executeAiTurn(input: AiMoveRequest) {
  const enrichedInput = await attachSkillEffectsToAiRequest(input);
  const normalizedConfig = normalizeEngineConfig(input.engineConfig);
  const response = await requestAiMove({
    ...enrichedInput,
    engineConfig: normalizedConfig,
  });

  await persistAiTurn({
    request: enrichedInput,
    normalizedConfig,
    response,
  });

  return response;
}
