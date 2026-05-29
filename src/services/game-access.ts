import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getGameOwnerId(gameId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .select('player_id')
    .eq('game_id', gameId)
    .limit(1)
    .maybeSingle<{ player_id: string }>();

  if (error) throw error;
  return data?.player_id ?? null;
}

export async function isGameOwnedBy(gameId: string, userId: string): Promise<boolean> {
  const ownerUserId = await getGameOwnerId(gameId);
  return ownerUserId === userId;
}
