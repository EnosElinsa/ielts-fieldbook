export interface ReadOptions { force?: boolean; ttlMs?: number; staleWhileRevalidate?: boolean }
export interface ReadSnapshot<T> { data?: T; error?: unknown; loading: boolean; updatedAt?: number }
export class ReadCacheInvalidatedError extends Error {
  constructor() { super('Read cache was invalidated.'); this.name = 'ReadCacheInvalidatedError'; }
}
interface Entry<T> extends ReadSnapshot<T> { hasData: boolean; request?: Promise<T> }

const entries = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();
let generation = 0;
const notify = (key: string) => listeners.get(key)?.forEach(listener => listener());

/** Include account, content version, and every parameter that changes the response. */
export function readCacheKey(owner: string | null, version: string, resource: string, params?: unknown): string {
  return JSON.stringify([owner, version, resource, params]);
}

export function readSnapshot<T>(key: string): ReadSnapshot<T> {
  const entry = entries.get(key) as Entry<T> | undefined;
  return entry ? { data: entry.data, error: entry.error, loading: entry.loading, updatedAt: entry.updatedAt } : { loading: false };
}

export function subscribeRead(key: string, listener: () => void): () => void {
  const subscriptions = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, subscriptions);
  subscriptions.add(listener);
  return () => { subscriptions.delete(listener); if (!subscriptions.size) listeners.delete(key); };
}

export function clearReadCache(): void {
  generation += 1;
  entries.clear();
  listeners.forEach((_, key) => notify(key));
}

/** Fresh reads reuse data; expired reads return stale data and publish background results. */
export function cachedRead<T>(key: string, loader: () => Promise<T>, options: ReadOptions = {}): Promise<T> {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) { entry = { hasData: false, loading: false }; entries.set(key, entry); }
  if (options.force && entry.request) {
    entry = { data: entry.data, hasData: entry.hasData, updatedAt: entry.updatedAt, loading: false };
    entries.set(key, entry);
  }
  const stale = entry.hasData && Date.now() - (entry.updatedAt ?? 0) >= (options.ttlMs ?? 300_000);
  if (!options.force && entry.hasData && !stale) return Promise.resolve(entry.data as T);
  if (!entry.request) {
    const requestGeneration = generation;
    const current = entry;
    current.loading = true;
    current.error = undefined;
    const request = Promise.resolve().then(loader).then(data => {
      if (generation !== requestGeneration || entries.get(key) !== current) throw new ReadCacheInvalidatedError();
      current.data = data; current.hasData = true; current.updatedAt = Date.now();
      return data;
    }).catch(error => {
      if (generation !== requestGeneration || entries.get(key) !== current) throw new ReadCacheInvalidatedError();
      current.error = error;
      throw error;
    }).finally(() => {
      if (generation === requestGeneration && entries.get(key) === current) {
        current.request = undefined; current.loading = false; notify(key);
      }
    });
    current.request = request;
    notify(key);
  }
  const request = entry.request!;
  if (!options.force && entry.hasData && options.staleWhileRevalidate !== false) {
    void request.catch(() => undefined);
    return Promise.resolve(entry.data as T);
  }
  return request;
}
