import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cachedRead, clearReadCache, readCacheKey, readSnapshot, subscribeRead } from './readCache';

beforeEach(() => { clearReadCache(); vi.useFakeTimers(); });
afterEach(() => { clearReadCache(); vi.useRealTimers(); });

test('concurrent readers share a request and fresh revisits reuse its result', async () => {
  let finish!: (value: string) => void;
  const loader = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const first = cachedRead('book', loader);
  const second = cachedRead('book', loader);
  await Promise.resolve();
  expect(loader).toHaveBeenCalledTimes(1);
  finish('content');
  expect(await first).toBe('content');
  expect(await second).toBe('content');
  expect(await cachedRead('book', loader)).toBe('content');
  expect(loader).toHaveBeenCalledTimes(1);
});

test('stale reads return immediately, publish refreshed content, and retain content on failure', async () => {
  await cachedRead('book', async () => 'first');
  vi.advanceTimersByTime(300_001);
  let finish!: (value: string) => void;
  const listener = vi.fn();
  const unsubscribe = subscribeRead('book', listener);
  expect(await cachedRead('book', () => new Promise<string>(resolve => { finish = resolve; }))).toBe('first');
  finish('second');
  await vi.waitFor(() => expect(readSnapshot<string>('book').data).toBe('second'));
  vi.advanceTimersByTime(300_001);
  expect(await cachedRead('book', async () => { throw new Error('offline'); })).toBe('second');
  await vi.waitFor(() => expect(readSnapshot('book').error).toBeInstanceOf(Error));
  expect(readSnapshot<string>('book').data).toBe('second');
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});

test('forced reads bypass freshness and reject refresh failures while keeping the snapshot', async () => {
  await cachedRead('book', async () => 'first');
  expect(await cachedRead('book', async () => 'second', { force: true })).toBe('second');
  await expect(cachedRead('book', async () => { throw new Error('offline'); }, { force: true })).rejects.toThrow('offline');
  expect(readSnapshot<string>('book').data).toBe('second');
});

test('forced retry supersedes a pending request so a slow old response cannot overwrite it', async () => {
  let finish!: (value: string) => void;
  const first = cachedRead('book', () => new Promise<string>(resolve => { finish = resolve; }));
  const assertion = expect(first).rejects.toThrow('Read cache was invalidated');
  await Promise.resolve();
  expect(await cachedRead('book', async () => 'retry', { force: true })).toBe('retry');
  finish('slow original');
  await assertion;
  expect(readSnapshot<string>('book').data).toBe('retry');
});

test('clearing the cache rejects pending results and prevents them publishing into a new scope', async () => {
  let finish!: (value: string) => void;
  const pending = cachedRead('book', () => new Promise<string>(resolve => { finish = resolve; }));
  const assertion = expect(pending).rejects.toThrow('Read cache was invalidated');
  await Promise.resolve();
  clearReadCache();
  await cachedRead('book', async () => 'new account');
  finish('previous account');
  await assertion;
  expect(readSnapshot<string>('book').data).toBe('new account');
});

test('superseded request failures are reported as invalidation instead of overwriting the retry error state', async () => {
  let fail!: (error: Error) => void;
  const first = cachedRead('book', () => new Promise<string>((_, reject) => { fail = reject; }));
  const assertion = expect(first).rejects.toThrow('Read cache was invalidated');
  await Promise.resolve();
  await cachedRead('book', async () => 'retry', { force: true });
  fail(new Error('old request offline'));
  await assertion;
  expect(readSnapshot('book').error).toBeUndefined();
});

test('cache keys separate accounts, content versions, and resource parameters', () => {
  const key = readCacheKey('a', '1', 'sections', ['s']);
  expect(readCacheKey('b', '1', 'sections', ['s'])).not.toBe(key);
  expect(readCacheKey('a', '2', 'sections', ['s'])).not.toBe(key);
  expect(readCacheKey('a', '1', 'sections', ['other'])).not.toBe(key);
});
