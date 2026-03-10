import { jsonOk, optionsResponse } from '@/lib/http';

export function optionsMeSnapshot() {
  return optionsResponse();
}

export async function getMeSnapshot() {
  return jsonOk({
    playerName: 'プレイヤー名',
    rating: 1200,
    pawnCurrency: 0,
    goldCurrency: 0,
    note: 'TEMP_MOCK_NO_USER_TABLE',
  });
}
