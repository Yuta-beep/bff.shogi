export function jsonRequest(url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function invalidJsonRequest(url: string, method: 'POST' | 'PUT' = 'POST') {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
}

export async function readJson(response: Response): Promise<any> {
  return await response.json();
}
