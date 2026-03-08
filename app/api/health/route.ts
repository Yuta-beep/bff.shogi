import { jsonOk, optionsResponse } from '@/lib/http';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export function GET() {
  return jsonOk({ status: 'ok', timestamp: new Date().toISOString() });
}
