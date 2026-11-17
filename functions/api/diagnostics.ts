import { diagnosticPayload } from '../../src/lib/diagnosticPayload';

type Environment = { DIAGNOSTICS?: { writeDataPoint: (point: { blobs: string[]; doubles: number[] }) => void } };
export async function onRequest({ request, env }: { request: Request; env: Environment }) {
  const response = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((requestOrigin !== null && requestOrigin !== origin)
    || (site !== null && site !== 'same-origin')
    || (requestOrigin !== origin && site !== 'same-origin')) return response(403);
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let payload;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        try { await reader.cancel(); } catch { /* Retain the size rejection if cancellation fails. */ }
        return response(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    payload = diagnosticPayload(JSON.parse(new TextDecoder().decode(bytes)));
  }
  catch { return response(400); }
  if (!payload) return response(400);
  // Cloudflare's centralized logs receive only the sanitized allowlisted shape.
  try {
    console.info('fieldbook:diagnostics', payload);
    if (env.DIAGNOSTICS) for (const event of payload.events) {
      env.DIAGNOSTICS.writeDataPoint({ blobs: [payload.release, event.name], doubles: [event.value] });
    }
  } catch { /* Collection is best effort; never log errors containing request data. */ }
  return response(204);
}
