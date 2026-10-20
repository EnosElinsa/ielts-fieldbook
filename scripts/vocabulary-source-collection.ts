type Work = { term: string; originalSense?: { sourceUrl?: string } | null };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function sourceTitle(item: Work) {
  try {
    const url = new URL(item.originalSense?.sourceUrl || '');
    if (url.origin === 'https://en.wiktionary.org') {
      const title = url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : url.pathname === '/w/index.php' ? url.searchParams.get('title') : null;
      if (title) return title.replaceAll('_', ' ');
    }
  } catch { /* A teaching-only phrase can still have a page; it does not acquire a source binding. */ }
  return item.term;
}

/** Collect evidence only. Exact title case and conflicting revisions remain visible to the source matcher. */
export async function collectRevisionSources(items: Work[], cached: unknown[], request: (titles: string[]) => Promise<unknown>, options: {
  batchSize?: number; attempts?: number; refreshMissing?: boolean;
  onResponse?: (response: unknown) => void | Promise<void>;
  onRetry?: (attempt: number) => void | Promise<void>;
  onProgress?: (state: { completed: number; requested: number; batches: number }) => void | Promise<void>;
} = {}) {
  const batchSize = options.batchSize ?? 20, attempts = options.attempts ?? 3;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('Use a source batch size from 1 to 50.');
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('Use 1–5 request attempts.');
  const titles = [...new Set(items.map(sourceTitle))], requested = new Set(titles);
  const pages = new Map<string, Map<string, RecordValue>>(), missing = new Set<string>();
  function inspect(response: unknown) {
    const values = object(object(response)?.query)?.pages;
    for (const raw of Object.values(object(values) || (Array.isArray(values) ? values : {}))) {
      const page = object(raw);
      if (typeof page?.title !== 'string' || !requested.has(page.title.replaceAll('_', ' '))) continue;
      const title = page.title.replaceAll('_', ' '), revisions = page.revisions;
      if (Object.hasOwn(page, 'missing') || Object.hasOwn(page, 'invalid')) missing.add(title);
      if (!Array.isArray(revisions) || revisions.length !== 1) continue;
      const revision = object(revisions[0]), main = object(object(revision?.slots)?.main), text = main?.['*'] ?? main?.content ?? revision?.['*'];
      if (!Number.isSafeInteger(revision?.revid) || Number(revision?.revid) <= 0 || typeof text !== 'string') continue;
      const variants = pages.get(title) || new Map<string, RecordValue>();
      variants.set(JSON.stringify([revision?.revid, text]), { ...page, title });
      pages.set(title, variants);
    }
  }
  for (const response of cached) inspect(response);
  if (options.refreshMissing) missing.clear();
  const resolved = (title: string) => pages.has(title) || missing.has(title);
  const reused = titles.filter(resolved).length, pending = titles.filter(title => !resolved(title));
  const failures: { titles: string[]; error: string }[] = [];
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    let unresolved = pending.slice(offset, offset + batchSize), error = '';
    for (let attempt = 0; attempt < attempts && unresolved.length; attempt++) {
      let response: unknown;
      try {
        response = await request([...unresolved]);
        const result = object(object(response)?.query)?.pages;
        if (!result || typeof result !== 'object') throw new Error('Missing source pages in API response.');
      } catch (reason) {
        error = String(reason); response = undefined;
      }
      if (response !== undefined) {
        inspect(response);
        // Persist each successful response before moving on. A persistence failure must stop the run.
        await options.onResponse?.(response);
        error = 'Source response did not resolve every requested title.';
      }
      unresolved = unresolved.filter(title => !resolved(title));
      if (unresolved.length && attempt + 1 < attempts) await options.onRetry?.(attempt + 1);
    }
    if (unresolved.length) failures.push({ titles: unresolved, error });
    await options.onProgress?.({ completed: titles.filter(resolved).length, requested: titles.length, batches: Math.floor(offset / batchSize) + 1 });
  }
  const evidence = [...pages].sort(([a], [b]) => compare(a, b)).flatMap(([, variants]) => [...variants].sort(([a], [b]) => compare(a, b)).map(([, page]) => page));
  // Missing pages are cached too, but a valid revision always takes precedence over a missing-page receipt.
  evidence.push(...titles.filter(title => missing.has(title) && !pages.has(title)).map(title => ({ title, missing: '' })));
  return { requested: titles.length, available: pages.size, reused,
    unavailable: titles.filter(title => missing.has(title) && !pages.has(title)),
    unresolved: titles.filter(title => !resolved(title)),
    conflictingTitles: titles.filter(title => (pages.get(title)?.size || 0) > 1), failures,
    responses: [{ query: { pages: Object.fromEntries(evidence.map((page, i) => [String(i + 1), page])) } }] };
}
