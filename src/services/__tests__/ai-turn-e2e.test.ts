import { describe, expect, it } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { requestAiMove } from '@/lib/ai-engine-client';
import { normalizeEngineConfig } from '@/lib/engine-config';
import {
  attachSkillEffectsToAiRequestWithClient,
  resetSkillRegistryV2CacheForTests,
} from '@/services/ai-skill-effects';
import { createCatalogBackedSupabaseAdmin } from './skill-catalog-test-client';

const AI_ENGINE_PORT = 18080;
const SHOGI_AI_ROOT = path.resolve(process.cwd(), '../shogi-ai');
const SHOGI_AI_BIN = path.resolve(SHOGI_AI_ROOT, 'target/debug/shogi-ai');
const itWithTimeout = it as any;

const CASES: E2eCase[] = [
  {
    name: 'forced_move: waterfall push wins over a plain step',
    expectedNotation: 'skill-push',
    expectedPieceCode: '滝',
    expectedSkillId: 65,
    request: buildRequest('e2e-skill-waterfall', '4k4/9/9/9/4R1r2/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '滝', 'skill-push'),
      move(4, 4, 3, 4, '滝', 'plain-step'),
    ]),
  },
  {
    name: 'apply_status: freeze aura is selected',
    expectedNotation: 'freeze-lock',
    expectedPieceCode: '氷',
    expectedSkillId: 19,
    request: buildRequest('e2e-skill-freeze', '4k4/9/9/9/4R1r2/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '氷', 'freeze-lock'),
      move(4, 4, 3, 4, '氷', 'plain-step'),
    ]),
  },
  {
    name: 'summon_piece: tree growth is selected',
    expectedNotation: 'tree-grow',
    expectedPieceCode: '木',
    expectedSkillId: 7,
    request: buildRequest('e2e-skill-tree', '4k4/9/9/9/4R4/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '木', 'tree-grow'),
      move(4, 4, 3, 4, '木', 'plain-step'),
    ]),
  },
  {
    name: 'transform_piece: adjacent enemy transform is selected',
    expectedNotation: 'pawn-curse',
    expectedPieceCode: 'あ',
    expectedSkillId: 30,
    request: buildRequest('e2e-skill-transform', '4k4/9/9/9/4R1r2/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, 'あ', 'pawn-curse'),
      move(4, 4, 3, 4, 'あ', 'plain-step'),
    ]),
  },
  {
    name: 'script_hook: bomb explosion push is selected',
    expectedNotation: 'explosion-push',
    expectedPieceCode: '爆',
    expectedSkillId: 97,
    request: buildRequest('e2e-skill-bomb', '4k4/9/9/9/4R1p2/5p3/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '爆', 'explosion-push'),
      move(4, 4, 3, 4, '爆', 'plain-step'),
    ]),
  },
  {
    name: 'board_hazard: poison trail is selected',
    expectedNotation: 'poison-trail',
    expectedPieceCode: '毒',
    expectedSkillId: 27,
    request: buildRequest('e2e-skill-poison', '4k4/9/9/9/1r2R4/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '毒', 'poison-trail'),
      move(4, 4, 3, 4, '毒', 'plain-step'),
    ]),
  },
  {
    name: 'modify_movement: swamp lock is selected',
    expectedNotation: 'swamp-lock',
    expectedPieceCode: '沼',
    expectedSkillId: 28,
    request: buildRequest('e2e-skill-swamp', '4k4/9/9/9/4R1r2/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '沼', 'swamp-lock'),
      move(4, 4, 3, 4, '沼', 'plain-step'),
    ]),
  },
  {
    name: 'defense_or_immunity: bird guard is selected',
    expectedNotation: 'guard-ally',
    expectedPieceCode: '禽',
    expectedSkillId: 73,
    request: buildRequest('e2e-skill-bird', '4k4/9/9/9/4R1P1r/9/9/9/4K4 b - 1', [
      move(4, 4, 4, 5, '禽', 'guard-ally'),
      move(4, 4, 3, 4, '禽', 'plain-step'),
    ]),
  },
];

describe('backend -> shogi-ai skill v2 e2e', () => {
  itWithTimeout(
    'selects the skill-driven move across 8 representative families with a catalog-backed client',
    { timeout: 30_000 },
    async () => {
      const catalogBackedSupabaseAdmin = createCatalogBackedSupabaseAdmin();
      const stderrChunks: string[] = [];
      const originalBaseUrl = process.env.AI_ENGINE_BASE_URL;
      let aiProcess: ChildProcess | null = null;

      if (!fs.existsSync(SHOGI_AI_BIN)) {
        console.log(`skipping e2e: shogi-ai binary not found at ${SHOGI_AI_BIN}`);
        return;
      }

      const port = AI_ENGINE_PORT + Math.floor(Math.random() * 1000);
      const baseUrl = `http://127.0.0.1:${port}`;
      process.env.AI_ENGINE_BASE_URL = baseUrl;

      aiProcess = spawn(SHOGI_AI_BIN, [], {
        cwd: SHOGI_AI_ROOT,
        env: {
          ...process.env,
          AI_ENGINE_BIND: `127.0.0.1:${port}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      aiProcess.stderr?.on('data', (chunk) => {
        stderrChunks.push(String(chunk));
      });

      try {
        await waitForHealth(baseUrl, aiProcess, stderrChunks);

        for (const testCase of CASES) {
          resetSkillRegistryV2CacheForTests();

          const enriched = await attachSkillEffectsToAiRequestWithClient(
            testCase.request,
            catalogBackedSupabaseAdmin as any,
            false,
          );
          expect(enriched.position.boardState.skills_enabled).toBe(true);
          expect(Boolean(enriched.position.boardState.skill_registry_v2)).toBe(true);
          expect(Boolean(enriched.position.boardState.skill_definitions_v2)).toBe(true);

          const definitions = ((enriched.position.boardState.skill_definitions_v2 as any)
            ?.definitions ?? []) as Array<{ skillId: number }>;
          expect(definitions.map((definition) => definition.skillId)).toEqual([
            testCase.expectedSkillId,
          ]);

          const response = await requestAiMove({
            ...enriched,
            engineConfig: normalizeEngineConfig(enriched.engineConfig),
          });

          expect(response.selectedMove.pieceCode).toBe(testCase.expectedPieceCode);
          expect(response.selectedMove.notation).toBe(testCase.expectedNotation);
          expect(response.meta.candidateCount).toBeGreaterThanOrEqual(1);
        }
      } finally {
        resetSkillRegistryV2CacheForTests();
        if (originalBaseUrl === undefined) {
          delete process.env.AI_ENGINE_BASE_URL;
        } else {
          process.env.AI_ENGINE_BASE_URL = originalBaseUrl;
        }

        if (aiProcess && aiProcess.exitCode === null) {
          aiProcess.kill('SIGTERM');
          await waitForProcessExit(aiProcess);
        }
      }
    },
  );
});

type E2eCase = {
  name: string;
  expectedNotation: string;
  expectedPieceCode: string;
  expectedSkillId: number;
  request: AiMoveRequest;
};

function buildRequest(
  gameId: string,
  sfen: string,
  legalMoves: AiMoveRequest['position']['legalMoves'],
): AiMoveRequest {
  return {
    gameId,
    moveNo: 1,
    position: {
      sideToMove: 'player',
      turnNumber: 1,
      moveCount: 0,
      sfen,
      stateHash: null,
      boardState: {},
      hands: {},
      legalMoves,
    },
    engineConfig: {
      randomSeed: 7,
    },
  };
}

function move(
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  pieceCode: string,
  notation: string,
  capturedPieceCode: string | null = null,
) {
  return {
    fromRow,
    fromCol,
    toRow,
    toCol,
    pieceCode,
    promote: false,
    dropPieceCode: null,
    capturedPieceCode,
    notation,
  };
}

async function waitForHealth(baseUrl: string, process: ChildProcess, stderrChunks: string[]) {
  const timeoutAt = Date.now() + 30_000;
  let lastError = '';

  while (Date.now() < timeoutAt) {
    if (process.exitCode !== null) {
      throw new Error(
        `shogi-ai exited before health check: ${stderrChunks.join('').trim() || 'no stderr'}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(200);
  }

  throw new Error(
    `failed to start shogi-ai test server: ${lastError || 'timeout'} ${stderrChunks.join('').trim()}`,
  );
}

async function waitForProcessExit(process: ChildProcess) {
  await new Promise<void>((resolve) => {
    process.once('exit', () => resolve());
    setTimeout(resolve, 3_000);
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
