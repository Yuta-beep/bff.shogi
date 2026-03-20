import { supabaseAdmin } from '@/lib/supabase-admin';

// 5 stamina recovered every 10 minutes
const STAMINA_PER_TICK = 5;
const MS_PER_TICK = 10 * 60 * 1000;

export type PlayerStamina = {
  stamina: number;
  maxStamina: number;
  nextRecoveryAt: string | null;
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
 * Returns the clamped current stamina, how many complete ticks passed,
 * and the ISO timestamp of the next recovery tick (null when at max).
 */
export function calculateCurrentStamina(
  stored: number,
  max: number,
  updatedAt: Date,
): { stamina: number; ticksPassed: number; nextRecoveryAt: string | null } {
  const elapsed = Date.now() - updatedAt.getTime();
  const ticksPassed = Math.floor(elapsed / MS_PER_TICK);
  const stamina = Math.min(max, stored + ticksPassed * STAMINA_PER_TICK);
  const nextRecoveryAt =
    stamina < max
      ? new Date(updatedAt.getTime() + (ticksPassed + 1) * MS_PER_TICK).toISOString()
      : null;
  return { stamina, ticksPassed, nextRecoveryAt };
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

  const { stamina, nextRecoveryAt } = calculateCurrentStamina(
    Number(data.stamina),
    Number(data.max_stamina),
    new Date(data.stamina_updated_at as string),
  );

  return { stamina, maxStamina: Number(data.max_stamina), nextRecoveryAt };
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

  const nextRecoveryAt =
    newStamina < maxStamina ? new Date(newUpdatedAt.getTime() + MS_PER_TICK).toISOString() : null;

  return { stamina: newStamina, maxStamina, nextRecoveryAt };
}
