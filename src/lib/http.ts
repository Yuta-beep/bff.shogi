import { NextResponse } from 'next/server';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  try {
    return NextResponse.json({ ok: true, data }, withCors(init));
  } catch (serializationError: unknown) {
    const message =
      serializationError instanceof Error
        ? serializationError.message
        : 'Response serialization failed';
    console.error('[jsonOk] failed to serialize response', serializationError);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message } },
      withCors({ status: 500 }),
    );
  }
}

export function jsonError(code: string, message: string, status = 400, init?: ResponseInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, withCors({ ...init, status }));
}

export function withCors(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-matching-internal-token, x-internal-user-id',
  );
  return { ...init, headers };
}

export function optionsResponse() {
  return new Response(null, withCors({ status: 204 }));
}
