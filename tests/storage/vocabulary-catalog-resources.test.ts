import { afterEach, expect, test, vi } from 'vitest';
import { buildVocabularyResources } from '../../scripts/vocabularyResources';
import { readFileSync } from 'node:fs';
import { loadReleasedVocabulary } from '../../src/storage/vocabularyCatalog';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const generated = buildVocabularyResources(process.cwd());

test.each(['teaching', 'entries'] as const)('a large %s load can finish healthy batches whose combined duration exceeds one request deadline', async kind => {
  vi.resetModules();
  const { loadReleasedVocabulary: loadEntries, loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const byShard = new Map<string, string>();
  for (const [id, shard] of Object.entries(generated.manifest.entryShards)) if (!byShard.has(shard)) byShard.set(shard, id);
  const entryIds = [...byShard.values()].slice(0, 20);
  expect(entryIds).toHaveLength(20);
  let active = 0, maximum = 0, completed = 0;
  vi.useFakeTimers();
  vi.stubGlobal('fetch', async (url: string) => {
    const body = url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : generated.resources.get(url);
    if (!url.endsWith('manifest.test.json')) {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 3_000));
      active--; completed++;
    }
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => JSON.parse(body!) };
  });
  let result: any, failure: unknown;
  const loading = (kind === 'teaching' ? loadTeaching({ entryIds }) : loadEntries({ entryIds }))
    .then(value => { result = value; }, error => { failure = error; });
  await vi.runAllTimersAsync();
  await loading;
  expect(failure).toBeUndefined();
  expect(maximum).toBe(4);
  expect(completed).toBe(20);
  expect(result.entries.map((entry: any) => entry.id).sort()).toEqual(kind === 'entries' ? entryIds.slice().sort() : []);
  const expectedMemberships = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8')).memberships.filter((row: any) => entryIds.includes(row.entryId));
  const membershipIds = new Set(result.memberships.map((row: any) => row.id));
  if (kind === 'teaching') expect(membershipIds).toEqual(new Set(expectedMemberships.map((row: any) => row.id)));
  else expect(result.memberships).toEqual([]); // Entry-body shards do not carry group memberships.
});

function resourceFetch(delay = 0) {
  let active = 0, maximum = 0;
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url); active++; maximum = Math.max(maximum, active);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    active--;
    const body = url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : generated.resources.get(url);
    return new Response(body, { status: body ? 200 : 404 });
  });
  return { urls, maximum: () => maximum };
}

test('book metadata does not fetch any group or entry packs', async () => {
  const requests = resourceFetch();
  const result = await loadReleasedVocabulary({ bookId: 'ielts-vocabulary', force: true });
  expect(result.books).toHaveLength(1);
  expect(result.units.length).toBeGreaterThan(1);
  expect(result.units.some(unit => unit.entryIds.length)).toBe(true);
  expect(result.entries).toEqual([]);
  expect(result.memberships).toEqual([]);
  expect(requests.urls).toEqual(['/vocabulary-resources/manifest.test.json']);
});

test('group loads include complete membership and register teaching before resolving', async () => {
  vi.resetModules();
  const { vocabularyTeaching } = await import('../../src/domain/vocabulary/runtimeData');
  const { loadReleasedVocabulary: loadGroup } = await import('../../src/storage/vocabularyCatalog');
  expect(vocabularyTeaching.curriculum.topics).toEqual([]);
  const requests = resourceFetch();
  const result = await loadGroup({ bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01', force: true });
  expect(result.entries).toHaveLength(55);
  expect(result.memberships).toHaveLength(55);
  expect(result.memberships.every(row => row.unitId === 'ielts-vocabulary-chapter-01-group-01')).toBe(true);
  expect(requests.urls.filter(url => url.includes('/groups/'))).toHaveLength(1);
  expect(vocabularyTeaching.curriculum.topics.some(row => row.unitId === 'ielts-vocabulary-chapter-01-group-01')).toBe(true);
  const { VOCABULARY_CATALOG } = await import('../../src/domain/vocabulary/catalog');
  const { resolveVocabularyLearningContext } = await import('../../src/domain/vocabulary/context');
  Object.assign(VOCABULARY_CATALOG, result);
  const core = result.entries.find(entry => entry.term === 'core')!;
  expect(resolveVocabularyLearningContext(core, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' }).sense?.definition).toContain('Earth');
  const edited = structuredClone(core);
  edited.senses[0].definition = 'My course note.';
  expect(resolveVocabularyLearningContext(edited, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' }).sense?.definition).toBe('My course note.');
});

test('entry loads deduplicate shards and cap all concurrent resource requests at four', async () => {
  const requests = resourceFetch(2);
  const entryIds = Object.keys(generated.manifest.entryShards).slice(0, 60);
  const results = await Promise.all([
    loadReleasedVocabulary({ entryIds: entryIds.slice(0, 30), force: true }),
    loadReleasedVocabulary({ entryIds: entryIds.slice(30), force: true }),
  ]);
  expect(new Set(results.flatMap(result => result.entries.map(entry => entry.id)))).toEqual(new Set(entryIds));
  expect(requests.maximum()).toBeLessThanOrEqual(4);
  expect(requests.urls.filter(url => url.includes('/entries/'))).toHaveLength(new Set(entryIds.map(id => generated.manifest.entryShards[id])).size);
  expect(requests.urls.filter(url => url.endsWith('manifest.test.json'))).toHaveLength(1);
});

test('failed resources reject and can be retried', async () => {
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  await expect(loadReleasedVocabulary({ force: true })).rejects.toThrow();
  resourceFetch();
  expect((await loadReleasedVocabulary()).books).toHaveLength(6);
});

test('a failed group pack retries without reloading successful metadata', async () => {
  const group = generated.manifest.units.find(unit => unit.bookId === 'ielts-vocabulary' && unit.id === 'ielts-vocabulary-chapter-01-group-01')!;
  vi.stubGlobal('fetch', async (url: string) => new Response(url === group.resource ? '' : JSON.stringify(generated.manifest), { status: url === group.resource ? 503 : 200 }));
  await expect(loadReleasedVocabulary({ bookId: group.bookId, unitId: group.id, force: true })).rejects.toThrow();
  const requests = resourceFetch();
  expect((await loadReleasedVocabulary({ bookId: group.bookId, unitId: group.id })).entries).toHaveLength(55);
  expect(requests.urls).toEqual([group.resource]);
});

test('unknown books and entries cannot look like successful empty released loads', async () => {
  resourceFetch();
  await expect(loadReleasedVocabulary({ bookId: 'missing-book', force: true })).rejects.toThrow(/book/i);
  await expect(loadReleasedVocabulary({ entryIds: ['missing-entry'] })).rejects.toThrow(/entry/i);
});

test('independent teaching resources restore group curriculum when the full group pack fails', async () => {
  vi.resetModules();
  const { loadReleasedVocabulary: loadGroup, loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { vocabularyTeaching } = await import('../../src/domain/vocabulary/runtimeData');
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    const body = url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : url.startsWith('/vocabulary-resources/groups/') ? undefined : generated.resources.get(url);
    return new Response(body, { status: body ? 200 : 503 });
  });
  await expect(loadGroup({ bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01', force: true })).rejects.toThrow();
  expect(vocabularyTeaching.curriculum.topics).toEqual([]);
  const metadata = await loadTeaching({ bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01', force: true });
  expect(metadata.books).toHaveLength(1);
  expect(metadata.entries).toEqual([]);
  expect(vocabularyTeaching.curriculum.topics.some(row => row.unitId === 'ielts-vocabulary-chapter-01-group-01')).toBe(true);
  expect(urls.filter(url => url.startsWith('/vocabulary-resources/groups/'))).toHaveLength(1);
  expect(urls.filter(url => url.includes('/teaching/groups/'))).toHaveLength(1);
});

test.each(['entries', 'memberships'])('incomplete group %s cannot look like a successful load', async field => {
  const group = generated.manifest.units.find(unit => unit.bookId === 'ielts-vocabulary' && unit.id === 'ielts-vocabulary-chapter-01-group-01')!;
  vi.stubGlobal('fetch', async (url: string) => {
    let body = url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : generated.resources.get(url);
    if (url === group.resource) body = JSON.stringify({ ...JSON.parse(body!), [field]: [] });
    return new Response(body, { status: body ? 200 : 404 });
  });
  await expect(loadReleasedVocabulary({ bookId: group.bookId, unitId: group.id, force: true })).rejects.toThrow(/missing/);
});

test('account teaching prefetch loads known entries while allowing custom account entry IDs', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { vocabularyTeaching } = await import('../../src/domain/vocabulary/runtimeData');
  const requests = resourceFetch();
  const publicEntry = 've-7c70dbbe';
  await loadTeaching({ entryIds: [publicEntry, 'my-custom-entry'], allowMissingEntryIds: true });
  expect(vocabularyTeaching.context.bindings.some(row => row.entryId === publicEntry)).toBe(true);
  expect(requests.urls.filter(url => url.includes('/teaching/entries/'))).toHaveLength(1);
  await expect(loadTeaching({ bookId: 'ielts-vocabulary', unitId: 'missing-group', allowMissingEntryIds: true })).rejects.toThrow(/group/i);
});

test('account teaching prefetch preserves standalone content semantics before any catalog entries are loaded', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { VOCABULARY_CATALOG } = await import('../../src/domain/vocabulary/catalog');
  const { reviewedEntry } = await import('../../src/domain/vocabulary/content');
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  resourceFetch();
  await loadTeaching({ entryIds: released.entries.map((entry: any) => entry.id), allowMissingEntryIds: true });
  const sparse = new Map(released.entries.map((entry: any) => [entry.id, JSON.stringify(reviewedEntry(entry))]));
  Object.assign(VOCABULARY_CATALOG, released);
  const differences = released.entries.filter((entry: any) => sparse.get(entry.id) !== JSON.stringify(reviewedEntry(entry))).map((entry: any) => entry.term);
  expect(differences.slice(0, 20)).toEqual([]);
});

test('account teaching prefetch restores source-group curriculum without loading entry bodies', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { VOCABULARY_CATALOG } = await import('../../src/domain/vocabulary/catalog');
  const { resolveVocabularyLearningContext } = await import('../../src/domain/vocabulary/context');
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const core = released.entries.find((entry: any) => entry.term === 'core');
  resourceFetch();
  const teaching = await loadTeaching({ entryIds: [core.id, 'custom-entry'], allowMissingEntryIds: true });
  expect(teaching.entries).toEqual([]);
  expect(teaching.memberships).toEqual(released.memberships.filter((row: any) => row.entryId === core.id));
  Object.assign(VOCABULARY_CATALOG, teaching);
  const context = resolveVocabularyLearningContext(core, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  expect(context.curriculum?.basis).toBe('theme');
  expect(context.curriculum?.title).toContain('Group 1');
  expect(context.sense?.definition).toContain('Earth');
});

test('account teaching prefetch protects private edits when the public catalog entry is absent', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { VOCABULARY_CATALOG } = await import('../../src/domain/vocabulary/catalog');
  const { resolveVocabularyLearningContext } = await import('../../src/domain/vocabulary/context');
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const raw = released.entries.find((entry: any) => entry.term === 'atmosphere');
  resourceFetch();
  const teaching = await loadTeaching({ entryIds: [raw.id] });
  Object.assign(VOCABULARY_CATALOG, teaching);
  const edited = structuredClone(raw);
  edited.senses[0].definition = 'My private study note.';
  expect(resolveVocabularyLearningContext(edited, {bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-01-group-01'}).sense?.definition).toBe('My private study note.');
});

test('account teaching prefetch preserves edited source meanings across the released corpus', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { VOCABULARY_CATALOG } = await import('../../src/domain/vocabulary/catalog');
  const { resolveVocabularyLearningContext } = await import('../../src/domain/vocabulary/context');
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  resourceFetch();
  const teaching = await loadTeaching({ entryIds: released.entries.map((entry: any) => entry.id) });
  Object.assign(VOCABULARY_CATALOG, teaching);
  const entries = new Map(released.entries.map((raw: any) => {
    const edited = structuredClone(raw); edited.senses[0].definition = 'My private study note.';
    return [edited.id, edited];
  }));
  const changed = released.memberships.filter((row: any) => resolveVocabularyLearningContext(entries.get(row.entryId) as any, row).sense?.definition !== 'My private study note.').map((row: any) => `${row.bookId}/${row.unitId}/${row.entryId}`);
  expect(changed.slice(0, 15)).toEqual([]);
}, 10_000);

test('hung shard requests release the cache and fetch slots for a retry', async () => {
  vi.resetModules();
  const { loadReleasedVocabulary: loadEntries } = await import('../../src/storage/vocabularyCatalog');
  vi.useFakeTimers();
  // Node 22's Response streams schedule work that can loop under fake timers.
  // This test exercises request timeouts, so keep the manifest mock stream-free.
  vi.stubGlobal('fetch', async (url: string) => url.endsWith('manifest.test.json') ? { ok: true, json: async () => generated.manifest } : new Promise(() => {}));
  const entryIds = Object.keys(generated.manifest.entryShards).slice(0, 60);
  let rejected = false;
  const stalled = loadEntries({ entryIds });
  void stalled.catch(() => { rejected = true; });
  await vi.advanceTimersByTimeAsync(10_001);
  expect(rejected).toBe(true);
  vi.useRealTimers();
  resourceFetch();
  expect((await loadEntries({ entryIds })).entries).toHaveLength(entryIds.length);
});

test('teaching fallback can use its independent index when the main manifest is unavailable', async () => {
  vi.resetModules();
  const { loadReleasedVocabularyTeaching: loadTeaching } = await import('../../src/storage/vocabularyCatalog');
  const { vocabularyTeaching } = await import('../../src/domain/vocabulary/runtimeData');
  vi.stubGlobal('fetch', async (url: string) => {
    const body = url.endsWith('manifest.test.json') ? undefined : url.endsWith('teaching-index.test.json') ? JSON.stringify(generated.teachingIndex) : generated.resources.get(url);
    return new Response(body, { status: body ? 200 : 503 });
  });
  await loadTeaching({ bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01', force: true });
  expect(vocabularyTeaching.curriculum.topics.some(row => row.unitId === 'ielts-vocabulary-chapter-01-group-01')).toBe(true);
});
