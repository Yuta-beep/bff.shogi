import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { listPieceCatalog } from '@/services/piece-master';

type PieceCatalogDeps = {
  listPieceCatalog: typeof listPieceCatalog;
};

export function optionsPieceCatalog() {
  return optionsResponse();
}

export function createGetPieceCatalog(deps: PieceCatalogDeps = { listPieceCatalog }) {
  return async function getPieceCatalog() {
    try {
      const items = await deps.listPieceCatalog();
      return jsonOk({ items });
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load piece catalog', 500);
    }
  };
}

export const getPieceCatalog = createGetPieceCatalog();
