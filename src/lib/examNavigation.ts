/** Keep explicit study origins in the URL so refreshes and new tabs retain them. */
export function safeExamReturn(value: unknown, fallback = ''): string {
  if (typeof value !== 'string' || value.length > 12000 || /[\s\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://fieldbook.local');
    if (url.origin !== 'https://fieldbook.local' || url.pathname + url.search + url.hash !== value) return fallback;
    const path = decodeURIComponent(url.pathname);
    if (/[\s\\]/.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) return fallback;
    return /^(?:\/(?:planning|today)?|\/(?:listening|reading)(?:\/(?:review|source|intensive|mock)\/[^/?#]+|\/[^/?#]+)?)$/.test(path) ? value : fallback;
  } catch { return fallback; }
}

export function withExamReturn(to: string, origin: unknown): string {
  const returnTo = safeExamReturn(origin);
  if (!returnTo) return to;
  const destination = new URL(to, 'https://fieldbook.local');
  destination.searchParams.set('returnTo', returnTo);
  return destination.pathname + destination.search + destination.hash;
}
