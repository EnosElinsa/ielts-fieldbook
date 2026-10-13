import { afterEach, expect, test, vi } from 'vitest';
import { requestTimeout } from './requestTimeout';
afterEach(() => vi.useRealTimers());
test('rejects a stalled read and ignores its late success', async () => {
  vi.useFakeTimers();
  let finish!: (value: string) => void;
  const result = requestTimeout(new Promise<string>(resolve => { finish = resolve; }), 100);
  const failed = expect(result).rejects.toThrow('Loading took too long');
  await vi.advanceTimersByTimeAsync(100); await failed;
  finish('late');
  expect(await requestTimeout(Promise.resolve('retry'))).toBe('retry');
});
test('clears the timer on success or rejection', async () => {
  vi.useFakeTimers();
  expect(await requestTimeout(Promise.resolve('ready'))).toBe('ready');
  await expect(requestTimeout(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  expect(vi.getTimerCount()).toBe(0);
});
