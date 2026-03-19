import { supabaseAdmin } from '@/lib/supabase-admin';

type AssetUrlCacheEntry = {
  url: string | null;
  expiresAtMs: number;
};

const DEFAULT_SIGNED_URL_TTL_SEC = 60 * 60;
const REFRESH_BUFFER_SEC = 2 * 60;
const MAX_CACHE_ENTRIES = 5000;

const globalCache = globalThis as typeof globalThis & {
  __storageAssetUrlCache?: Map<string, AssetUrlCacheEntry>;
};

function getCache(): Map<string, AssetUrlCacheEntry> {
  if (!globalCache.__storageAssetUrlCache) {
    globalCache.__storageAssetUrlCache = new Map<string, AssetUrlCacheEntry>();
  }
  return globalCache.__storageAssetUrlCache;
}

function usePublicAssetUrl(): boolean {
  return process.env.SUPABASE_STORAGE_PUBLIC_ASSETS !== 'false';
}

function pruneCache(cache: Map<string, AssetUrlCacheEntry>) {
  if (cache.size < MAX_CACHE_ENTRIES) return;
  const targetSize = Math.floor(MAX_CACHE_ENTRIES * 0.9);
  const iter = cache.keys();
  while (cache.size > targetSize) {
    const key = iter.next();
    if (key.done) break;
    cache.delete(key.value);
  }
}

export async function getStorageAssetUrl(
  bucket: string | null,
  key: string | null,
  opts?: { signedUrlTtlSec?: number },
): Promise<string | null> {
  if (!bucket || !key) return null;

  if (usePublicAssetUrl()) {
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(key);
    return data?.publicUrl ?? null;
  }

  const ttlSec = opts?.signedUrlTtlSec ?? DEFAULT_SIGNED_URL_TTL_SEC;
  const now = Date.now();
  const refreshBeforeMs = REFRESH_BUFFER_SEC * 1000;
  const cacheKey = `${bucket}::${key}::${ttlSec}`;
  const cache = getCache();
  const cached = cache.get(cacheKey);

  if (cached && now + refreshBeforeMs < cached.expiresAtMs) {
    return cached.url;
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(key, ttlSec);
  const entry: AssetUrlCacheEntry = {
    url: error ? null : (data?.signedUrl ?? null),
    expiresAtMs: now + ttlSec * 1000,
  };
  cache.set(cacheKey, entry);
  pruneCache(cache);
  return entry.url;
}
