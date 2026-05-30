import { performance } from 'node:perf_hooks';

type PerfFields = Record<string, string | number | boolean | null | undefined>;

const PERF_LOG_ENABLED = process.env.PERF_LOG_ENABLED !== 'false';

function formatFields(fields?: PerfFields): string {
  if (!fields) return '';
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';
  return ` ${entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')}`;
}

export async function measure<T>(
  label: string,
  fn: () => PromiseLike<T> | T,
  fields?: PerfFields,
): Promise<T> {
  if (!PERF_LOG_ENABLED) return await fn();

  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(
      `[perf] ${label}: ${Math.round(performance.now() - start)}ms${formatFields(fields)}`,
    );
  }
}

export function measureSync<T>(label: string, fn: () => T, fields?: PerfFields): T {
  if (!PERF_LOG_ENABLED) return fn();

  const start = performance.now();
  try {
    return fn();
  } finally {
    console.log(
      `[perf] ${label}: ${Math.round(performance.now() - start)}ms${formatFields(fields)}`,
    );
  }
}

export function getFetchTimeoutMs(envKey: string, fallbackMs: number): number {
  const raw = process.env[envKey];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit & { timeoutMs?: number; label?: string },
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 5000;
  const { timeoutMs: _timeoutMs, label, ...fetchInit } = init;
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  return measure(
    label ?? `fetch ${typeof input === 'string' ? input : input.toString()}`,
    () => fetch(input, { ...fetchInit, signal }),
    { timeoutMs },
  );
}
