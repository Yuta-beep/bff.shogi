import { optionsAiMove, postAiMove } from '@/server/handlers/v1/ai/move';

export const runtime = 'nodejs';

export const OPTIONS = optionsAiMove;
export const POST = postAiMove;
