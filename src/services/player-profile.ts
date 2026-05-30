import { supabaseAdmin } from '@/lib/supabase-admin';
import { measure } from '@/lib/perf';
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
  nextRecoveryAt: string | null;
};

export async function getPlayerSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  const { data, error } = await measure(
    'players.getPlayerSnapshot.query',
    () =>
      supabaseAdmin
        .from('players')
        .select(
          'display_name,rating,pawn_currency,gold_currency,player_rank,player_exp,stamina,max_stamina,stamina_updated_at',
        )
        .eq('id', userId)
        .limit(1)
        .maybeSingle(),
    { userId },
  );

  if (error) throw error;
  if (!data) return null;

  const maxStamina = Number(data.max_stamina ?? 50);
  const { stamina, nextRecoveryAt } = calculateCurrentStamina(
    Number(data.stamina ?? 50),
    maxStamina,
    new Date((data.stamina_updated_at as string) ?? new Date().toISOString()),
  );

  return {
    displayName: (data.display_name as string | null) ?? null,
    rating: Math.max(0, Math.floor(Number(data.rating ?? 0))),
    pawnCurrency: Number(data.pawn_currency ?? 0),
    goldCurrency: Number(data.gold_currency ?? 0),
    playerRank: Number(data.player_rank ?? 1),
    playerExp: Number(data.player_exp ?? 0),
    stamina,
    maxStamina,
    nextRecoveryAt,
  };
}

export async function getPlayerDisplayName(userId: string): Promise<string | null> {
  const { data, error } = await measure(
    'players.getPlayerDisplayName.query',
    () =>
      supabaseAdmin.from('players').select('display_name').eq('id', userId).limit(1).maybeSingle(),
    { userId },
  );

  if (error) throw error;
  return (data?.display_name as string | null) ?? null;
}

export async function upsertPlayerDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await measure(
    'players.upsertPlayerDisplayName.query',
    () =>
      supabaseAdmin
        .from('players')
        .upsert(
          {
            id: userId,
            display_name: displayName,
          },
          { onConflict: 'id' },
        )
        .select('id')
        .single(),
    { userId },
  );

  if (error) throw error;
}
