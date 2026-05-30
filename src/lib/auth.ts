import { timingSafeEqual } from 'node:crypto';

import { measure } from '@/lib/perf';
import { supabaseAdmin } from '@/lib/supabase-admin';

const AUTH_CACHE_TTL_MS = getAuthCacheTtlMs();
const AUTH_NEGATIVE_CACHE_TTL_MS = 1_000;
const AUTH_CACHE_MAX_ENTRIES = 1_000;

type AuthCacheEntry = {
  userId: string | null;
  expiresAt: number;
};

const authCache = new Map<string, AuthCacheEntry>();
const authInFlight = new Map<string, Promise<string | null>>();

export async function resolveBearerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const now = Date.now();
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.userId;
  }

  const inFlight = authInFlight.get(token);
  if (inFlight) return inFlight;

  const resolver = measure('supabase.auth.getUser', async () => {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const userId = error || !data.user ? null : data.user.id;
    pruneAuthCache(now);
    authCache.set(token, {
      userId,
      expiresAt: now + resolveAuthCacheTtlMs(token, userId != null),
    });
    return userId;
  });

  authInFlight.set(token, resolver);
  try {
    return await resolver;
  } finally {
    authInFlight.delete(token);
  }
}

export function isAuthorizedInternalRequest(req: Request): boolean {
  const expected = (process.env.MATCHING_BFF_INTERNAL_TOKEN ?? '').trim();
  if (!expected) return false;

  const token = (req.headers.get('x-matching-internal-token') ?? '').trim();
  if (!token) return false;

  const expectedBytes = Buffer.from(expected, 'utf8');
  const tokenBytes = Buffer.from(token, 'utf8');
  if (expectedBytes.length !== tokenBytes.length) return false;

  return timingSafeEqual(expectedBytes, tokenBytes);
}

function pruneAuthCache(now: number): void {
  if (authCache.size < AUTH_CACHE_MAX_ENTRIES) return;

  for (const [token, entry] of authCache.entries()) {
    if (entry.expiresAt <= now) {
      authCache.delete(token);
    }
  }

  while (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldestToken = authCache.keys().next().value;
    if (typeof oldestToken !== 'string') break;
    authCache.delete(oldestToken);
  }
}

function resolveAuthCacheTtlMs(token: string, isAuthorized: boolean): number {
  if (!isAuthorized) return AUTH_NEGATIVE_CACHE_TTL_MS;

  const jwtExpiryAt = parseJwtExpiryAt(token);
  if (!jwtExpiryAt) return AUTH_CACHE_TTL_MS;

  return Math.max(0, Math.min(AUTH_CACHE_TTL_MS, jwtExpiryAt - Date.now()));
}

function getAuthCacheTtlMs(): number {
  const parsed = Number(process.env.AUTH_CACHE_TTL_MS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return 60_000;
}

function parseJwtExpiryAt(token: string): number | null {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return null;

  try {
    const payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    const expSeconds = Number(payload.exp);
    if (!Number.isFinite(expSeconds) || expSeconds <= 0) return null;
    return expSeconds * 1000;
  } catch {
    return null;
  }
}
