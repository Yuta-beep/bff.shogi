import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getStorageAssetUrl(
  bucket: string | null,
  key: string | null,
  _opts?: { signedUrlTtlSec?: number },
): Promise<string | null> {
  if (!bucket || !key) return null;

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(key);
  return data?.publicUrl ?? null;
}
