import { afterEach, describe, expect, test, vi } from 'vitest';
import { aggregateMediaCredits, getVocabularyIllustration, getVocabularyMedia, legacyVocabularyRecordings, vocabularyMediaShard } from './media';
import { resolveVocabularyLearningContext } from './context';
import supplements from './contextSenseOverlay.json';
import type { VocabularyEntry } from './types';
const core = { id: 've-7c70dbbe', term: 'core', senses: [supplements.bindings.find(item => item.entryId === 've-7c70dbbe' && item.unitId === '21795')!.originalSense] } as unknown as VocabularyEntry;
afterEach(() => vi.unstubAllGlobals());
describe('sense-bound vocabulary media', () => {
 test('food and geography core use different local images, unknown broad context has no image', () => {
  const earth = resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21795' });
  const food = resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21840' });
  expect(getVocabularyIllustration(earth)?.src).toContain('earth-layers');
  expect(getVocabularyIllustration(food)?.src).toContain('apple-section');
  expect(getVocabularyIllustration(resolveVocabularyLearningContext(core))).toBeUndefined();
 });
 test('a learner edit does not receive a public sense image', () => {
  const resolved = resolveVocabularyLearningContext({ ...core, senses: [{ ...core.senses[0], definition: 'My custom definition' }] }, { bookId: 'guixue:10174', unitId: '21795' });
  expect(getVocabularyIllustration(resolved)).toBeUndefined();
 });
 test('on-demand shards share a request and failed requests retry instead of poisoning the cache', async () => {
  const entry = { id: 'media-test-entry' } as unknown as VocabularyEntry;
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ ok: true, json: async () => ({ [entry.id]: { version: 'test', recordings: [] } }) });
  vi.stubGlobal('fetch', fetcher);
  const first = await getVocabularyMedia(entry); expect(first.loadError).toBe(true);
  const [second, third] = await Promise.all([getVocabularyMedia(entry), getVocabularyMedia(entry)]);
  expect(second.version).toBe('test'); expect(third).toEqual(second); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0]).toBe(`/vocabulary-media/audio/${vocabularyMediaShard(entry.id)}.json`);
 });
 test('retains safe personal/backup URLs as unverified explicit candidates', () => {
  const legacy = legacyVocabularyRecordings({ pronunciation: { uk: 'https://example.org/voice.ogg?tracking=1', us: 'javascript:alert(1)' } } as VocabularyEntry);
  expect(legacy).toHaveLength(1); expect(legacy[0]).toMatchObject({ url: 'https://example.org/voice.ogg', accent: 'unknown', status: 'unknown' });
  expect(legacyVocabularyRecordings({ pronunciation: { uk: 'https://user:password@example.org/audio.mp3' } } as VocabularyEntry)).toEqual([]);
 });
 test('credits retain author, license and change statement while deduplicating the same source', () => {
  const image = getVocabularyIllustration(resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21795' }))!;
  const credits = aggregateMediaCredits([], image);
  expect(credits).toHaveLength(1); expect(credits[0]).toMatchObject({ author: 'Surachit', license: 'CC BY-SA 3.0' }); expect(credits[0].changes).toContain('white');
 });
});
