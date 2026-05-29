import { supabaseAdmin } from '@/lib/supabase-admin';

export async function resolveBearerUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function isAuthorizedInternalRequest(req: Request): boolean {
  const expected = (process.env.MATCHING_BFF_INTERNAL_TOKEN ?? '').trim();
  if (!expected) return false;

  const token = (req.headers.get('x-matching-internal-token') ?? '').trim();
  return token.length > 0 && token === expected;
}
