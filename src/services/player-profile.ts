import { supabaseAdmin } from '@/lib/supabase-admin';
import { calculateCurrentStamina } from '@/services/stamina';

export type PlayerSnapshot = {
  displayName: string | null;
  rating: number;
  pawnCurrency: number;
  goldCurrency: number;
  playerRank: number;
  playerExp: number;
  stamina: number;
  maxStamina: number;
};

export async function getPlayerSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select(
      'display_name,rating,pawn_currency,gold_currency,player_rank,player_exp,stamina,max_stamina,stamina_updated_at',
    )
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const maxStamina = Number(data.max_stamina ?? 50);
  const { stamina } = calculateCurrentStamina(
    Number(data.stamina ?? 50),
    maxStamina,
    new Date((data.stamina_updated_at as string) ?? new Date().toISOString()),
  );

  return {
    displayName: (data.display_name as string | null) ?? null,
    rating: Number(data.rating ?? 1500),
    pawnCurrency: Number(data.pawn_currency ?? 0),
    goldCurrency: Number(data.gold_currency ?? 0),
    playerRank: Number(data.player_rank ?? 1),
    playerExp: Number(data.player_exp ?? 0),
    stamina,
    maxStamina,
  };
}

export async function getPlayerDisplayName(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('display_name')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.display_name as string | null) ?? null;
}

export async function upsertPlayerDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('players')
    .upsert(
      {
        id: userId,
        display_name: displayName,
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();

  if (error) throw error;
}
