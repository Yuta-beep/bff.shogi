import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { listPieceCatalog } from '@/services/master';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  try {
    const items = await listPieceCatalog();
    return jsonOk({ items });
  } catch (error: any) {
    return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load piece catalog', 500);
  }
}
