import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadDictionaryIndex, loadTermDictionary, resetDictionaryCache } from './dictionary';

const sense = { id: 's', pos: 'noun', definition: 'Land beside a river.', example: '' };
beforeEach(resetDictionaryCache);
afterEach(() => vi.unstubAllGlobals());
test('one cached index and term file serve concurrent lookups, and absent terms do not download a corpus', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { bank: 'aa.json' } : { senses: [sense] } }));
  vi.stubGlobal('fetch', fetcher);
  expect(await Promise.all([loadTermDictionary('bank'), loadTermDictionary(' BANK ')] )).toEqual([[sense], [sense]]);
  expect(await loadTermDictionary('absent')).toEqual([]);
  expect(await loadDictionaryIndex()).toEqual({ bank: 'aa.json' });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/dictionary/index.json', '/dictionary/aa.json']);
});
test('failed index and failed term files are retryable independently', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ bank: 'aa.json' }) })
    .mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ senses: [sense] }) });
  vi.stubGlobal('fetch', fetcher);
  await expect(loadTermDictionary('bank')).rejects.toThrow();
  await expect(loadTermDictionary('bank')).rejects.toThrow();
  expect(await loadTermDictionary('bank')).toEqual([sense]);
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/dictionary/index.json', '/dictionary/index.json', '/dictionary/aa.json', '/dictionary/aa.json']);
});
test('a reset starts a fresh index and a late old rejection cannot remove the new cache', async () => {
  let reject!: (error: Error) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ bank: 'aa.json' }) });
  vi.stubGlobal('fetch', fetcher);
  const old = loadDictionaryIndex();
  resetDictionaryCache();
  expect(await loadDictionaryIndex()).toEqual({ bank: 'aa.json' });
  reject(new Error('old failure'));
  await expect(old).rejects.toThrow('old failure');
  await loadDictionaryIndex();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
