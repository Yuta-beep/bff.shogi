import { describe, expect, it } from 'bun:test';

import { isAuthorizedInternalRequest } from '@/lib/auth';
import { optionsResponse, withCors } from '@/lib/http';

describe('auth helper', () => {
  it('rejects internal requests when token env is missing', () => {
    const original = process.env.MATCHING_BFF_INTERNAL_TOKEN;
    delete process.env.MATCHING_BFF_INTERNAL_TOKEN;
    try {
      const req = new Request('http://localhost', {
        headers: { 'x-matching-internal-token': 'secret' },
      });
      expect(isAuthorizedInternalRequest(req)).toBe(false);
    } finally {
      process.env.MATCHING_BFF_INTERNAL_TOKEN = original;
    }
  });

  it('authorizes only exact internal token matches', () => {
    const original = process.env.MATCHING_BFF_INTERNAL_TOKEN;
    process.env.MATCHING_BFF_INTERNAL_TOKEN = 'secret-token';
    try {
      const okReq = new Request('http://localhost', {
        headers: { 'x-matching-internal-token': 'secret-token' },
      });
      const ngReq = new Request('http://localhost', {
        headers: { 'x-matching-internal-token': 'secret-token-x' },
      });

      expect(isAuthorizedInternalRequest(okReq)).toBe(true);
      expect(isAuthorizedInternalRequest(ngReq)).toBe(false);
    } finally {
      process.env.MATCHING_BFF_INTERNAL_TOKEN = original;
    }
  });
});

describe('http cors helper', () => {
  it('does not allow internal-only headers via CORS', () => {
    const init = withCors();
    const headers = new Headers(init.headers);

    expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    expect(headers.get('Vary')).toBe(
      'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    );
  });

  it('returns OPTIONS response with cors headers', () => {
    const response = optionsResponse();

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
