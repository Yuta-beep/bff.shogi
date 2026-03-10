import type { EngineConfig } from '@/lib/ai-engine-contract';

export type NormalizedEngineConfig = {
  maxDepth: number;
  maxNodes: number;
  timeLimitMs: number;
  quiescenceEnabled: boolean;
  evalMaterialWeight: number;
  evalPositionWeight: number;
  evalKingSafetyWeight: number;
  evalMobilityWeight: number;
  blunderRate: number;
  blunderMaxLossCp: number;
  randomTopk: number;
  temperature: number;
  alwaysLegalMove: boolean;
  mateAvoidance: boolean;
  maxRepeatDrawBias: number;
  randomSeed: number | null;
};

const defaults: NormalizedEngineConfig = {
  maxDepth: 3,
  maxNodes: 20_000,
  timeLimitMs: 300,
  quiescenceEnabled: true,
  evalMaterialWeight: 1.0,
  evalPositionWeight: 0.35,
  evalKingSafetyWeight: 0.25,
  evalMobilityWeight: 0.2,
  blunderRate: 0.0,
  blunderMaxLossCp: 0,
  randomTopk: 1,
  temperature: 0.0,
  alwaysLegalMove: true,
  mateAvoidance: true,
  maxRepeatDrawBias: 0.0,
  randomSeed: null,
};

export function normalizeEngineConfig(input?: EngineConfig): NormalizedEngineConfig {
  const cfg: NormalizedEngineConfig = {
    ...defaults,
    ...(input ?? {}),
    alwaysLegalMove: input?.alwaysLegalMove ?? defaults.alwaysLegalMove,
    mateAvoidance: input?.mateAvoidance ?? defaults.mateAvoidance,
  };

  ensureIntRange('maxDepth', cfg.maxDepth, 1, 12);
  ensureIntRange('maxNodes', cfg.maxNodes, 100, 5_000_000);
  ensureIntRange('timeLimitMs', cfg.timeLimitMs, 10, 60_000);

  ensureNumberRange('evalMaterialWeight', cfg.evalMaterialWeight, 0, 10);
  ensureNumberRange('evalPositionWeight', cfg.evalPositionWeight, 0, 10);
  ensureNumberRange('evalKingSafetyWeight', cfg.evalKingSafetyWeight, 0, 10);
  ensureNumberRange('evalMobilityWeight', cfg.evalMobilityWeight, 0, 10);

  ensureNumberRange('blunderRate', cfg.blunderRate, 0, 1);
  ensureIntRange('blunderMaxLossCp', cfg.blunderMaxLossCp, 0, 3000);

  ensureIntRange('randomTopk', cfg.randomTopk, 1, 20);
  ensureNumberRange('temperature', cfg.temperature, 0, 2);
  ensureNumberRange('maxRepeatDrawBias', cfg.maxRepeatDrawBias, -1, 1);

  if (cfg.alwaysLegalMove !== true) {
    throw new Error('alwaysLegalMove must be true');
  }
  if (cfg.mateAvoidance !== true) {
    throw new Error('mateAvoidance must be true');
  }
  if (cfg.randomSeed !== null && cfg.randomSeed !== undefined) {
    ensureIntRange('randomSeed', cfg.randomSeed, 0, Number.MAX_SAFE_INTEGER);
  }

  return cfg;
}

function ensureIntRange(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}`);
  }
}

function ensureNumberRange(name: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number in ${min}..${max}`);
  }
}
