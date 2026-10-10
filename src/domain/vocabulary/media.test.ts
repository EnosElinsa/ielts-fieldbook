import { afterEach, describe, expect, test, vi } from 'vitest';
import { aggregateMediaCredits, getVocabularyIllustration, getVocabularyMedia, legacyVocabularyRecordings, vocabularyMediaShard } from './media';
import { resolveVocabularyLearningContext } from './context';
import supplements from './contextSenseOverlay.json';
import type { VocabularyEntry } from './types';
import { readFileSync } from 'node:fs';
import type { VocabularyMedia } from './media';
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
  const legacy = legacyVocabularyRecordings({ pronunciation: { uk: 'https://example.org/voice.ogg?utm_source=1', us: 'javascript:alert(1)' } } as VocabularyEntry);
  expect(legacy).toHaveLength(1); expect(legacy[0]).toMatchObject({ url: 'https://example.org/voice.ogg', accent: 'unknown', status: 'unknown' });
  expect(legacyVocabularyRecordings({ pronunciation: { uk: 'https://user:password@example.org/audio.mp3' } } as VocabularyEntry)).toEqual([]);
 });
 test('preserves functional and signed query bytes while dropping only known tracking and fragments', () => {
  const legacy = legacyVocabularyRecordings({ pronunciation: { uk: 'https://example.org/pronounce?word=core&accent=uk&utm_source=commons&signature=a%2fb%20c&tracking=keep&gclid=drop#player' } } as VocabularyEntry);
  expect(legacy[0].url).toBe('https://example.org/pronounce?word=core&accent=uk&signature=a%2fb%20c&tracking=keep');
 });
 test.each(['ve-eab4f1ac', 've-b8747f4'])('reconciles real rejected wordform aliases for %s without creating an unknown alternative', async id => {
  const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8')) as { entries: VocabularyEntry[] };
  const entry = catalog.entries.find(item => item.id === id)!;
  const shard = JSON.parse(readFileSync(`public/vocabulary-media/audio/${vocabularyMediaShard(id)}.json`, 'utf8')) as Record<string, VocabularyMedia>;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => shard }));
  const manifest = shard[id];
  const rejected = manifest.recordings.filter(item => item.wordformConfirmed === false);
  expect(rejected.length).toBeGreaterThan(0);
  expect(rejected.every(item => item.aliases?.length)).toBe(true);
  const resolved = await getVocabularyMedia(entry);
  expect(resolved.recordings).toEqual(manifest.recordings);
  expect(resolved.recordings.filter(item => item.wordformConfirmed !== false).some(item => /currant|baa/i.test(item.url))).toBe(false);
  // Looking up the original canonical URL also preserves the same rejected evidence.
  const canonicalEntry = { ...entry, pronunciation: { uk: rejected[0].url } };
  expect((await getVocabularyMedia(canonicalEntry)).recordings).toEqual(manifest.recordings);
  const personal = { ...entry, pronunciation: { uk: entry.pronunciation?.uk, us: 'https://example.org/pronounce?word=new' } };
  expect((await getVocabularyMedia(personal)).recordings.at(-1)).toMatchObject({ url: 'https://example.org/pronounce?word=new', status: 'unknown' });
 });
 test('credits retain author, license and change statement while deduplicating the same source', () => {
  const image = getVocabularyIllustration(resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21795' }))!;
  const credits = aggregateMediaCredits([], image);
  expect(credits).toHaveLength(1); expect(credits[0]).toMatchObject({ author: 'Surachit', license: 'CC BY-SA 3.0' }); expect(credits[0].changes).toContain('white');
 });
});
