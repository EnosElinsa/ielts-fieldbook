import { afterEach, expect, test, vi } from 'vitest';
import { lookupVocabularyCapture, vocabularyLookupForms } from './vocabularyCaptureLookup';
import type { VocabularyEntry } from '../../domain/vocabulary';
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), dictionary: vi.fn(), meanings: vi.fn() }));
vi.mock('../../storage/vocabularyCatalog', () => ({ lookupReleasedVocabularyTerms: mocks.catalog }));
vi.mock('./dictionary', () => ({ loadDictionaryIndex: mocks.dictionary, loadTermDictionary: mocks.meanings, resetDictionaryCache: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
const sense = { id: 's', definition: 'Public meaning.', example: 'Public example.', pos: 'noun' };
const entry = { id: 'e', term: 'locker', senses: [sense], tags: [], sources: [] } as unknown as VocabularyEntry;
test('dictionary-form suggestions never silently change the selected form', async () => {
  mocks.catalog.mockResolvedValue([entry]); mocks.dictionary.mockResolvedValue({ locker: 'abc.json' });
  const result = await lookupVocabularyCapture('lockers', []);
  expect(result.matches).toEqual([]);
  expect(result.suggestions).toEqual(['locker']);
  expect(vocabularyLookupForms('BUSINESS')).toEqual(['business']);
});
test('saved personal content takes precedence over the public version of the same sense', async () => {
  mocks.catalog.mockResolvedValue([entry]); mocks.dictionary.mockResolvedValue({});
  const personal = { ...entry, senses: [{ ...sense, definition: 'My personal meaning.', example: '', source: 'Personal note' }] };
  const result = await lookupVocabularyCapture('locker', [personal]);
  expect(result.matches.filter(row => row.sense.id === 's')).toEqual([expect.objectContaining({ saved: true, sense: personal.senses[0] })]);
});
test('a lookup failure is distinct from no matches and retains usable saved choices', async () => {
  mocks.catalog.mockRejectedValue(new Error('offline')); mocks.dictionary.mockResolvedValue({});
  const result = await lookupVocabularyCapture('locker', [entry]);
  expect(result.unavailable).toBe(true);
  expect(result.matches[0].saved).toBe(true);
});

test.each(['index', 'meanings'])('a stalled dictionary %s times out and retains saved choices for collection', async source => {
  vi.useFakeTimers();
  mocks.catalog.mockResolvedValue([]);
  mocks.dictionary.mockImplementation(() => source === 'index' ? new Promise(() => {}) : Promise.resolve({ locker: 'abc.json' }));
  mocks.meanings.mockImplementation(() => new Promise(() => {}));
  const pending = lookupVocabularyCapture('locker', [entry]);
  await vi.advanceTimersByTimeAsync(10_001);
  const result = await pending;
  expect(result.unavailable).toBe(true);
  expect(result.matches).toEqual([expect.objectContaining({ saved: true, sense })]);
});
