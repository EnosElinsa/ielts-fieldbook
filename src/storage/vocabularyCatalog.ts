import manifestUrl, { teachingIndexUrl } from 'virtual:vocabulary-manifest';
import type { VocabularyEntry } from '../domain/vocabulary/types';
import { registerVocabularyTeaching, type VocabularyTeachingData } from '../domain/vocabulary/runtimeData';
import { requestTimeout } from '../lib/requestTimeout';
import { normalizeVocabularyScope } from '../domain/vocabulary/identities';

export type ReleasedVocabularyOptions = { bookId?: string; unitId?: string; entryIds?: string[]; force?: boolean };
export type ReleasedVocabularyTeachingOptions = ReleasedVocabularyOptions & { allowMissingEntryIds?: boolean };
type Book = { id: string; [key: string]: unknown };
type Unit = { id: string; bookId: string; entryIds: string[]; entryCount: number; archivedEntryIds?: string[]; resource?: string; teachingResource?: string; [key: string]: unknown };
type Membership = { id: string; entryId: string; bookId: string; unitId: string; order: number; [key: string]: unknown };
type Manifest = { version: number; books: Book[]; units: Unit[]; entryCount: number; entryShards: Record<string, string>; entryResources: Record<string, string>; entryTeachingResources: Record<string, string> };
type TeachingIndex = { version: number; bookIds: string[]; books: Book[]; units: Unit[]; groups: Record<string, string>; entryShards: Record<string, string>; entryTeachingResources: Record<string, string> };
type Pack = { entries: VocabularyEntry[]; memberships: Membership[]; teaching: VocabularyTeachingData };
type TeachingPack = Pick<Pack, 'teaching' | 'memberships'>;
export type ReleasedVocabularyCatalog = { books: Book[]; units: Unit[]; entries: VocabularyEntry[]; memberships: Membership[] };

export class VocabularyScopeUnavailableError extends Error {
  constructor(public scope: 'book' | 'group' | 'entry') {
    super(`Released vocabulary ${scope} is unavailable.`);
    this.name = 'VocabularyScopeUnavailableError';
  }
}

const resourceConcurrency = 4;
let activeFetches = 0;
const waiting: (() => void)[] = [];
function pump() {
  while (activeFetches < resourceConcurrency && waiting.length) waiting.shift()!();
}
function limited<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      activeFetches++;
      job().then(resolve, reject).finally(() => { activeFetches--; pump(); });
    });
    pump();
  });
}
const requests = new Map<string, { promise: Promise<unknown>; pending: boolean }>();
const registeredResources = new Set<string>();
function resource<T>(url: string, force = false): Promise<T> {
  const existing = requests.get(url);
  if (existing && (!force || existing.pending)) return existing.promise as Promise<T>;
  const controller = new AbortController();
  // Queue time is bounded as well: expired queued jobs must not occupy later fetch slots.
  const cached = { pending: true, promise: requestTimeout(limited(async () => {
    if (controller.signal.aborted) throw new Error('Vocabulary resource request expired.');
    return requestTimeout(fetch(url, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error(`Vocabulary resource unavailable (${response.status}).`);
      return response.json();
    }));
  })).finally(() => controller.abort()) };
  requests.set(url, cached);
  cached.promise.then(() => { cached.pending = false; }, () => {
    if (requests.get(url) === cached) requests.delete(url);
  });
  return cached.promise as Promise<T>;
}

/** Admit a bounded batch before starting resource deadlines; keep results in source order. */
async function resourceBatch<T>(urls: Set<string>, force = false): Promise<{ url: string; pack: T }[]> {
  const queue = [...urls], packs = new Array<{ url: string; pack: T }>(queue.length);
  // A concurrent load may refresh a URL before this batch reaches it. Reuse that
  // newer request, while still refreshing successes that predate this batch.
  const refresh = new Map([...requests].filter(([url, cached]) => force && urls.has(url) && !cached.pending));
  let next = 0, failed = false;
  await Promise.all(Array.from({ length: Math.min(resourceConcurrency, queue.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= queue.length) return;
      const url = queue[index];
      try {
        const pack = await resource<T>(url, refresh.has(url) && requests.get(url) === refresh.get(url));
        packs[index] = { url, pack };
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  return packs;
}

async function readManifest(force = false) {
  const manifest = await resource<Manifest>(manifestUrl, force);
  if (manifest.version !== 1 || !Array.isArray(manifest.books) || !Array.isArray(manifest.units) || !manifest.entryShards || !manifest.entryResources || !manifest.entryTeachingResources) throw new Error('Invalid vocabulary resource manifest.');
  return manifest;
}
function selectedMetadata(manifest: Manifest, options: ReleasedVocabularyOptions) {
  const books = options.bookId ? manifest.books.filter(book => book.id === options.bookId) : manifest.books;
  const units = options.bookId ? manifest.units.filter(unit => unit.bookId === options.bookId) : manifest.units;
  if (options.bookId && !books.length) throw new VocabularyScopeUnavailableError('book');
  const group = options.unitId ? units.find(unit => unit.id === options.unitId && (!options.bookId || unit.bookId === options.bookId)) : undefined;
  if (options.unitId && (!group || !group.resource || !group.teachingResource)) throw new VocabularyScopeUnavailableError('group');
  return { books, units, group };
}
function registerTeaching(url: string, data: VocabularyTeachingData) {
  if (!data?.senseBaselines || !data.curriculum || !data.readiness || !data.context || !data.learning || !data.tasks) throw new Error('Invalid vocabulary teaching resource.');
  if (!registeredResources.has(url)) {
    registerVocabularyTeaching(data);
    registeredResources.add(url);
  }
}

/** Remote catalog fallback must restore public teaching before exposing raw dictionary entries. */
export async function loadReleasedVocabularyTeaching(options: ReleasedVocabularyTeachingOptions = {}): Promise<ReleasedVocabularyCatalog> {
  options = normalizeVocabularyScope(options);
  let manifest: Manifest | undefined;
  try { manifest = await readManifest(options.force); } catch { /* The teaching index is independent of the main manifest. */ }
  let metadata: Pick<ReleasedVocabularyCatalog, 'books' | 'units'> = { books: [], units: [] };
  let entryShards: Record<string, string>;
  let entryResources: Record<string, string>;
  const urls = new Set<string>();
  if (manifest) {
    const selected = selectedMetadata(manifest, options);
    metadata = { books: selected.books, units: selected.units };
    if (selected.group?.teachingResource) urls.add(selected.group.teachingResource);
    entryShards = manifest.entryShards;
    entryResources = manifest.entryTeachingResources;
  } else {
    const index = await resource<TeachingIndex>(teachingIndexUrl, options.force);
    if (index.version !== 1 || !Array.isArray(index.bookIds) || !Array.isArray(index.books) || !Array.isArray(index.units) || !index.groups || !index.entryShards || !index.entryTeachingResources) throw new Error('Invalid vocabulary teaching index.');
    if (options.bookId && !index.bookIds.includes(options.bookId)) throw new VocabularyScopeUnavailableError('book');
    if (options.unitId) {
      const url = index.groups[JSON.stringify([options.bookId, options.unitId])];
      if (!url) throw new VocabularyScopeUnavailableError('group');
      urls.add(url);
    }
    entryShards = index.entryShards;
    entryResources = index.entryTeachingResources;
    metadata = { books: options.bookId ? index.books.filter(book => book.id === options.bookId) : index.books, units: options.bookId ? index.units.filter(unit => unit.bookId === options.bookId) : index.units };
  }
  const groupIds = new Set(manifest?.units.find(unit => unit.bookId === options.bookId && unit.id === options.unitId)?.entryIds || []);
  for (const id of options.entryIds || []) {
    if (groupIds.has(id)) continue;
    if (!Object.hasOwn(entryShards, id) && options.allowMissingEntryIds) continue;
    const url = entryResources[entryShards[id]];
    if (!url) throw new VocabularyScopeUnavailableError('entry');
    urls.add(url);
  }
  const memberships = new Map<string, Membership>();
  const requestedIds = new Set(options.entryIds || []);
  const packs = await resourceBatch<TeachingPack>(urls, options.force);
  for (const {url, pack} of packs) {
    if (!Array.isArray(pack.memberships)) throw new Error('Invalid vocabulary teaching memberships.');
    registerTeaching(url, pack.teaching);
    for (const row of pack.memberships) {
      if (requestedIds.has(row.entryId) || row.bookId === options.bookId && row.unitId === options.unitId) memberships.set(row.id, row);
    }
  }
  const group = metadata.units.find(unit => unit.bookId === options.bookId && unit.id === options.unitId);
  if (group && group.entryIds.some(id => ![...memberships.values()].some(row => row.bookId === group.bookId && row.unitId === group.id && row.entryId === id))) throw new Error('Vocabulary teaching resource is missing group memberships.');
  return { ...metadata, entries: [], memberships: [...memberships.values()] };
}

/** Metadata requests never download entries; group and entry requests load their teaching baselines first. */
export async function loadReleasedVocabulary(options: ReleasedVocabularyOptions = {}): Promise<ReleasedVocabularyCatalog> {
  options = normalizeVocabularyScope(options);
  const manifest = await readManifest(options.force);
  const { books, units, group } = selectedMetadata(manifest, options);
  const urls = new Set<string>();
  if (group?.resource) urls.add(group.resource);
  const requestedIds = new Set(options.entryIds || []);
  const groupIds = new Set(group?.entryIds || []);
  for (const id of requestedIds) {
    if (groupIds.has(id)) continue;
    const url = manifest.entryResources[manifest.entryShards[id]];
    if (!url) throw new VocabularyScopeUnavailableError('entry');
    urls.add(url);
  }
  const packs = await resourceBatch<Pack>(urls, options.force);
  const entries = new Map<string, VocabularyEntry>();
  const memberships = new Map<string, Membership>();
  for (const { url, pack } of packs) {
    if (!Array.isArray(pack.entries) || !Array.isArray(pack.memberships) || !pack.teaching) throw new Error('Invalid vocabulary resource pack.');
    registerTeaching(url, pack.teaching);
    for (const entry of pack.entries) if (groupIds.has(entry.id) || requestedIds.has(entry.id)) entries.set(entry.id, entry);
    for (const row of pack.memberships) memberships.set(row.id, row);
  }
  if ([...groupIds, ...requestedIds].some(id => !entries.has(id))) throw new Error('Vocabulary resource is missing requested entries.');
  if (group && [...groupIds].some(id => ![...memberships.values()].some(row => row.bookId === group.bookId && row.unitId === group.id && row.entryId === id))) throw new Error('Vocabulary resource is missing group memberships.');
  return { books, units, entries: [...entries.values()], memberships: [...memberships.values()] };
}
