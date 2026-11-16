/** Release suspended connections so auth refresh and subsequent requests can recover. */
export async function connectionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal || (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener('abort', abort, { once: true });
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  // Media uploads can be large on a slow connection. Workspace writes already
  // have their own transaction deadline; auth and reads need a short escape.
  const deadline = ['GET', 'HEAD'].includes(method) || /\/auth\/v1\//.test(target) ? 15_000 : 120_000;
  const timer = setTimeout(() => controller.abort(new Error('Connection timeout. Check your connection and retry.')), deadline);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abort);
  }
}
