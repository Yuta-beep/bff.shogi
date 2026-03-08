import { NextResponse } from 'next/server';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, withCors(init));
}

export function jsonError(code: string, message: string, status = 400, init?: ResponseInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, withCors({ ...init, status }));
}

export function withCors(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return { ...init, headers };
}

export function optionsResponse() {
  return new Response(null, withCors({ status: 204 }));
}
