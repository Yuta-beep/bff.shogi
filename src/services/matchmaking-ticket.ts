import { createHmac } from 'node:crypto';
import { getPublicPlayerProfile } from '@/services/pvp-rating';

export type MatchmakingTicket = {
  ticket: string;
  expiresAt: string;
  user: {
    userId: string;
    displayName: string;
    rating: number;
  };
};

const DEFAULT_TTL_SECONDS = 120;

export async function issueMatchmakingTicket(userId: string): Promise<MatchmakingTicket> {
  const secret = getTicketSecret();
  const profile = await getPublicPlayerProfile(userId);
  if (!profile) {
    throw new Error('Player profile not found');
  }

  const exp = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS;
  const payload = {
    userId,
    displayName: profile.displayName,
    rating: profile.rating,
    exp,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signaturePart = createHmac('sha256', secret).update(payloadPart).digest('base64url');

  return {
    ticket: `${payloadPart}.${signaturePart}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    user: {
      userId,
      displayName: profile.displayName,
      rating: profile.rating,
    },
  };
}

function getTicketSecret() {
  const secret = (process.env.MATCHING_TICKET_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('MATCHING_TICKET_SECRET is not configured');
  }
  return secret;
}
