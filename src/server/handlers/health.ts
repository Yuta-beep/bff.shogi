import { jsonOk, optionsResponse } from '@/lib/http';

export function optionsHealth() {
  return optionsResponse();
}

export function getHealth() {
  return jsonOk({ status: 'ok', timestamp: new Date().toISOString() });
}
