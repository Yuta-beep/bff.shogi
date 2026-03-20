import { supabaseAdmin } from '@/lib/supabase-admin';

// 50 stamina per hour, recovered 5 at a time → 1 tick every 6 minutes
const STAMINA_PER_TICK = 5;
const MS_PER_TICK = 6 * 60 * 1000;

export type PlayerStamina = {
  stamina: number;
  maxStamina: number;
};

export class InsufficientStaminaError extends Error {
  readonly code = 'INSUFFICIENT_STAMINA' as const;

  constructor(
    public readonly current: number,
    public readonly required: number,
  ) {
    super(`Insufficient stamina: ${current} available, ${required} required`);
    this.name = 'InsufficientStaminaError';
  }
}

/**
 * Compute how much stamina the player actually has, accounting for ticks
 * that have elapsed since `updatedAt`.
 * Returns the clamped current stamina and how many complete ticks passed.
 */
export function calculateCurrentStamina(
  stored: number,
  max: number,
  updatedAt: Date,
): { stamina: number; ticksPassed: number } {
  const elapsed = Date.now() - updatedAt.getTime();
  const ticksPassed = Math.floor(elapsed / MS_PER_TICK);
  const stamina = Math.min(max, stored + ticksPassed * STAMINA_PER_TICK);
  return { stamina, ticksPassed };
}

export async function getPlayerStamina(userId: string): Promise<PlayerStamina> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('stamina,max_stamina,stamina_updated_at')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Player not found');

  const { stamina } = calculateCurrentStamina(
    Number(data.stamina),
    Number(data.max_stamina),
    new Date(data.stamina_updated_at as string),
  );

  return { stamina, maxStamina: Number(data.max_stamina) };
}

/**
 * Deduct `cost` stamina from the player, applying any pending recovery first.
 * Throws InsufficientStaminaError if the player cannot afford the cost.
 */
export async function deductPlayerStamina(userId: string, cost: number): Promise<PlayerStamina> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('stamina,max_stamina,stamina_updated_at')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Player not found');

  const storedStamina = Number(data.stamina);
  const maxStamina = Number(data.max_stamina);
  const updatedAt = new Date(data.stamina_updated_at as string);

  const { stamina: currentStamina, ticksPassed } = calculateCurrentStamina(
    storedStamina,
    maxStamina,
    updatedAt,
  );

  if (currentStamina < cost) {
    throw new InsufficientStaminaError(currentStamina, cost);
  }

  const newStamina = currentStamina - cost;
  // Advance the timestamp by exactly the ticks that were consumed so future
  // recovery is calculated from the correct baseline.
  const newUpdatedAt = new Date(updatedAt.getTime() + ticksPassed * MS_PER_TICK);

  const { error: updateError } = await supabaseAdmin
    .from('players')
    .update({ stamina: newStamina, stamina_updated_at: newUpdatedAt.toISOString() })
    .eq('id', userId);

  if (updateError) throw updateError;

  return { stamina: newStamina, maxStamina };
}
