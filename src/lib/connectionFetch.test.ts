import { afterEach, expect, test, vi } from 'vitest';
import { connectionFetch } from './connectionFetch';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
test('stalled transport aborts and a new connection succeeds', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
    signal = init.signal;
    signal!.addEventListener('abort', () => reject(signal!.reason));
  }));
  vi.stubGlobal('fetch', fetch);
  const first = connectionFetch('/account');
  const verdict = expect(first).rejects.toThrow(/timeout/i);
  await vi.advanceTimersByTimeAsync(15_001);
  await verdict;
  expect(signal!.aborted).toBe(true);
  vi.useRealTimers();
  fetch.mockImplementationOnce(async () => new Response('ready'));
  expect(await (await connectionFetch('/account')).text()).toBe('ready');
});
test('caller cancellation remains connected to the transport', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))));
  const result = connectionFetch('/account', { signal: controller.signal });
  const verdict = expect(result).rejects.toThrow('Cancelled');
  controller.abort(new Error('Cancelled'));
  await verdict;
});
test('slow media uploads retain their longer deadline and can still be cancelled', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => { signal = init.signal; signal!.addEventListener('abort', () => reject(signal!.reason)); })));
  const result = connectionFetch('/storage/v1/object/recording', { method: 'POST', body: new Blob(['audio']), signal: controller.signal });
  const verdict = expect(result).rejects.toThrow('Cancelled');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(signal!.aborted).toBe(false);
  controller.abort(new Error('Cancelled'));
  await verdict;
});
