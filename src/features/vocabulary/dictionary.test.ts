import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadDictionaryIndex, loadTermDictionary, resetDictionaryCache } from './dictionary';
import { readFileSync } from 'node:fs';

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

test('additional meanings receive same-sense teaching content without changing the cached source or another entry', async () => {
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const raw = JSON.parse(readFileSync(`public/dictionary/${index.bank}`, 'utf8'));
  const before = structuredClone(raw);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { bank: index.bank } : raw })));
  const enriched = await loadTermDictionary('bank', 've-7c704483');
  expect(enriched.find(s => s.id === 'kaikki:c130710755a265600e')).toMatchObject({
    example: 'We sat on the bank of the river and watched the boats.',
    collocations: ['river bank', 'on the bank', 'the opposite bank'],
    editorial: { attribution: 'Fieldbook editorial contributors' },
    source: 'English Wiktionary via Kaikki.org',
  });
  expect(enriched.find(s => s.id === 'kaikki:c130710755a265600e')?.distinctions?.join(' ')).toMatch(/shore/);
  expect(await loadTermDictionary('bank', 'personal-bank')).toEqual(before.senses);
  expect(raw).toEqual(before);
});
