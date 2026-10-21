import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadDictionaryIndex, loadTermDictionary, resetDictionaryCache } from './dictionary';
import { readFileSync } from 'node:fs';
import restoredSources from '../../domain/vocabulary/dictionarySenseSources.json';
import { registerVocabularyTeaching, vocabularyTeaching } from '../../domain/vocabulary/runtimeData';
import { isRegisteredRestoredVocabularySense } from '../../domain/vocabulary/readiness';

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
  expect(enriched.find(s => s.id === 'kaikki:c130710755a265600e')?.distinctions).toEqual([
    'This bank is land along a watercourse; a financial bank is an institution.',
  ]);
  expect(await loadTermDictionary('bank', 'personal-bank')).toEqual(before.senses);
  expect(raw).toEqual(before);
});

test('restored submeanings are independent scoped choices while cached dictionary records stay unchanged', async () => {
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const raw = JSON.parse(readFileSync(`public/dictionary/${index.field}`, 'utf8'));
  const before = structuredClone(raw);
  const source = restoredSources.find(row => row.term === 'field' && row.sense.definition.includes('section of a form'))!;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { field: index.field } : raw })));
  const enriched = await loadTermDictionary('field', source.entryId);
  expect(enriched.find(s => s.id === source.sense.id)).toMatchObject({ definition: 'A space in a form for entering one item of information.', example: 'Enter your email address in the required field.' });
  // Repeated grouping definitions can represent different submeanings. Keep stable IDs.
  expect(raw.senses.every((s: {id: string}) => enriched.some(e => e.id === s.id))).toBe(true);
  expect(enriched.map(s => s.id)).toHaveLength(new Set(enriched.map(s => s.id)).size);
  expect((await loadTermDictionary('field', 'personal-field')).some(s => s.id === source.sense.id)).toBe(false);
  expect((await loadTermDictionary('field')).some(s => s.id === source.sense.id)).toBe(false);
  expect(raw).toEqual(before);
});

test('a teaching pack registered after the raw term was cached exposes its restored meanings', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { 'late-test': 'aa.json' } : { senses: [sense] } })));
  expect(await loadTermDictionary('late-test', 'late-entry')).toEqual([sense]);
  const original = { ...sense, id: 'restored-late', definition: 'A separate source meaning.' };
  registerVocabularyTeaching({ ...vocabularyTeaching, readiness: { ...vocabularyTeaching.readiness, corrections: [{ entryId: 'late-entry', senseId: original.id, dictionaryParentSenseId: sense.id, originalSense: original, definition: 'A separate reviewed meaning.', example: 'A useful example.' }] } });
  try {
    expect(await loadTermDictionary('late-test', 'late-entry')).toEqual([sense, expect.objectContaining({ id: original.id, definition: 'A separate reviewed meaning.' })]);
    expect(await loadTermDictionary('late-test')).toEqual([sense]);
  } finally {
    vocabularyTeaching.readiness.corrections = vocabularyTeaching.readiness.corrections.filter(row => row.entryId !== 'late-entry');
    registerVocabularyTeaching({ ...vocabularyTeaching });
  }
});

test('an independent restored meaning is scoped by its raw entry anchor and validates exact released text', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { 'root-test': 'aa.json' } : { senses: [sense] } })));
  const original = { ...sense, id: 'independent-restoration', definition: 'An independent source meaning.' };
  registerVocabularyTeaching({ ...vocabularyTeaching, readiness: { ...vocabularyTeaching.readiness, corrections: [{ entryId: 'root-entry', senseId: original.id, dictionarySourceAnchorSenseId: sense.id, originalSense: original, definition: 'An independent reviewed meaning.', example: 'A useful example.' }] } });
  try {
    const meanings = await loadTermDictionary('root-test', 'root-entry');
    const selected = meanings.find(row => row.id === original.id)!;
    expect(selected?.definition).toBe('An independent reviewed meaning.');
    expect(await loadTermDictionary('root-test', 'other-entry')).toEqual([sense]);
    expect(isRegisteredRestoredVocabularySense('root-entry', selected)).toBe(true);
    for (const patch of [{ definition: 'My custom definition.' }, { pos: 'other' }, { source: 'Personal note' }])
      expect(isRegisteredRestoredVocabularySense('root-entry', { ...selected, ...patch })).toBe(false);
    expect(isRegisteredRestoredVocabularySense('other-entry', selected)).toBe(false);
    vocabularyTeaching.readiness.corrections.find(row => row.entryId === 'root-entry')!.dictionarySourceAnchorSenseId = 'absent';
    registerVocabularyTeaching(vocabularyTeaching);
    expect(await loadTermDictionary('root-test', 'root-entry')).toEqual([sense]);
  } finally {
    vocabularyTeaching.readiness.corrections = vocabularyTeaching.readiness.corrections.filter(row => row.entryId !== 'root-entry');
    registerVocabularyTeaching(vocabularyTeaching);
  }
});
