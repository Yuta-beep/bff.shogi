import { jsonOk, optionsResponse } from '@/lib/http';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  return jsonOk({
    playerName: 'プレイヤー名',
    rating: 1200,
    pawnCurrency: 0,
    goldCurrency: 0,
    note: 'TEMP_MOCK_NO_USER_TABLE',
  });
}
