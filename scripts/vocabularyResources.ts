import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import type { VocabularyTeachingData } from '../src/domain/vocabulary/runtimeData';
import type { VocabularyEntry } from '../src/domain/vocabulary/types';

type Unit = { id: string; bookId: string; kind: string; entryIds: string[]; entryCount: number; archivedEntryIds: string[]; resource?: string; teachingResource?: string; [key: string]: unknown };
type Membership = { id: string; bookId: string; unitId: string; entryId: string; order: number };
type Catalog = { entries: VocabularyEntry[]; books: { id: string }[]; units: Unit[]; memberships: Membership[] };
type RowSelector<T> = (ids: Set<string>) => T[];
type SliceCacheEntry<T> = { tableRef: unknown; value: T };
type ScopeTeachingCache = {
  curriculumCommon?: SliceCacheEntry<VocabularyTeachingData['curriculum']['common']>;
  curriculumTopics?: SliceCacheEntry<VocabularyTeachingData['curriculum']['topics']>;
  curriculumSource?: SliceCacheEntry<VocabularyTeachingData['curriculum']['source']>;
  curriculumRepairs?: SliceCacheEntry<VocabularyTeachingData['curriculum']['repairs']>;
  curriculumModern?: SliceCacheEntry<VocabularyTeachingData['curriculum']['modern']>;
  readinessCore?: SliceCacheEntry<VocabularyTeachingData['readiness']['core']>;
  readinessCorrections?: SliceCacheEntry<VocabularyTeachingData['readiness']['corrections']>;
  readinessDefaults?: SliceCacheEntry<VocabularyTeachingData['readiness']['defaults']>;
  learning?: SliceCacheEntry<VocabularyTeachingData['learning']>;
  tasks?: SliceCacheEntry<VocabularyTeachingData['tasks']>;
  contextBindings?: SliceCacheEntry<VocabularyTeachingData['context']['bindings']>;
  contextDefaults?: SliceCacheEntry<VocabularyTeachingData['context']['defaults']>;
  contextUnresolved?: SliceCacheEntry<VocabularyTeachingData['context']['unresolved']>;
  curriculum?: VocabularyTeachingData['curriculum'];
  readiness?: VocabularyTeachingData['readiness'];
  context?: VocabularyTeachingData['context'];
  scoped?: VocabularyTeachingData;
};
type UnitPlan = {
  unit: Unit;
  members: Membership[];
  entryIds: string[];
  entries: VocabularyEntry[];
  archivedEntryIds: string[];
  idSet: Set<string>;
  termSet: Set<string>;
  name: string;
  senseBaselines?: VocabularyTeachingData['senseBaselines'];
  scopeCache: ScopeTeachingCache;
};
type ShardPlan = {
  shard: number;
  entries: VocabularyEntry[];
  idSet: Set<string>;
  termSet: Set<string>;
  memberships: Membership[];
  senseBaselines: VocabularyTeachingData['senseBaselines'];
  scopeCache: ScopeTeachingCache;
};
type PreparedCatalog = {
  unitPlans: UnitPlan[];
  shardPlans: ShardPlan[];
  entryShards: Record<string, string>;
  terms: Record<string, string[]>;
};
type ResourceBuildCache = {
  baselines: WeakMap<VocabularyEntry, VocabularyTeachingData['senseBaselines'][string]>;
  emissions: Map<string, { value: unknown; url: string }>;
  serialized: WeakMap<object, string>;
  entryIndexes: WeakMap<object, RowSelector<unknown>>;
  recordIndexes: WeakMap<object, RowSelector<[string, unknown]>>;
  prepared: WeakMap<Catalog, PreparedCatalog>;
};
const BASELINE_FIELDS = new Set(['id', 'definition', 'example', 'pos', 'collocations', 'usage', 'synonyms', 'antonyms', 'distinctions', 'distinctionTask', 'wordFamily', 'register', 'source']);
// Keep the retained corpus as UTF-8 bytes. Decoding every historical file into
// long-lived JS strings exhausts the heap as content releases accumulate.
class VocabularyResourceFiles {
  private files = new Map<string, Buffer>();
  get size() { return this.files.size; }
  has(url: string) { return this.files.has(url); }
  get(url: string) { return this.files.get(url)?.toString('utf8'); }
  getBytes(url: string) { return this.files.get(url); }
  setBytes(url: string, bytes: Buffer) { this.files.set(url, bytes); }
  keys() { return this.files.keys(); }
  byteEntries() { return this.files.entries(); }
  *entries(): IterableIterator<[string, string]> {
    for (const [url, bytes] of this.files) yield [url, bytes.toString('utf8')];
  }
  *values() { for (const bytes of this.files.values()) yield bytes.toString('utf8'); }
  [Symbol.iterator]() { return this.entries(); }
}
const REVALIDATE = 'public, max-age=0, must-revalidate';
const IMMUTABLE = 'public, max-age=31536000, immutable';
export function vocabularyResourceHeaders(manifestUrl: string, teachingIndexUrl: string): string {
  return [
    [manifestUrl, REVALIDATE], [teachingIndexUrl, REVALIDATE],
    ['/vocabulary-resources/groups/*', IMMUTABLE], ['/vocabulary-resources/entries/*', IMMUTABLE], ['/vocabulary-resources/teaching/*', IMMUTABLE],
  ].map(([url, policy]) => `${url}\n  Cache-Control: ${policy}\n`).join('\n');
}
export function buildVocabularyResources(root: string, options: { includeHistory?: boolean } = {}) {
  const { includeHistory = true } = options;
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const source = read('public/vocabulary-catalog.json') as Catalog;
  const data = (file: string) => read(`src/domain/vocabulary/${file}.json`);
  const teaching: VocabularyTeachingData = {
    senseBaselines: {},
    curriculum: { common: data('groupCurriculumCommon'), topics: [...data('groupCurriculumTopicsA'), ...data('groupCurriculumTopicsB'), ...data('groupCurriculumTopicsC')], source: data('groupCurriculumSource'), repairs: data('groupCurriculumRepairs'), modern: data('groupCurriculumModernDefaults') },
    readiness: { core: [...data('readinessContent0'), ...data('readinessContent1'), ...data('readinessContent2')], corrections: data('readinessCorrections'), defaults: data('readinessDefaults') },
    learning: data('learningSenseOverlay'), tasks: data('taskSenseBindings'), context: data('contextSenseOverlay'),
  };
  const cache: ResourceBuildCache = {
    baselines: new WeakMap(),
    emissions: new Map(),
    serialized: new WeakMap(),
    entryIndexes: new WeakMap(),
    recordIndexes: new WeakMap(),
    prepared: new WeakMap(),
  };
  const resources = new VocabularyResourceFiles();
  // Reconstruct both manifest forms. Open clients may retain the newer manifest
  // containing termIndexUrl as well as the earlier manifest without it.
  const generated = buildResourceCatalog(source, teaching, cache, resources, true);
  if (!includeHistory) return generated;
  // Reverse each published correction batch in order to preserve its exact URLs and bytes.
  // Merge directly into the shared resource store so historical catalog objects can be collected.
  let beforeDictionaryExpansion = teaching;
  for (const filename of data('resourceDictionaryRevisions') as string[]) {
    const baseline = data(filename) as { removeCorrections: {entryId:string; senseId:string}[]; restoreCorrections: VocabularyTeachingData['readiness']['corrections']; removeDefaults?: string[]; restoreDefaults?: VocabularyTeachingData['readiness']['defaults']; removeTopics?: {bookId:string;unitId:string;entryId:string;senseId:string}[]; restoreTopicRows?: VocabularyTeachingData['curriculum']['topics']; removeCorrectionVariants?: {entryId:string;senseId:string;variantId:string}[]; restoreCorrectionVariants?: VocabularyTeachingData['readiness']['corrections']; restoreCorrectionsSnapshot?: VocabularyTeachingData['readiness']['corrections']; restoreDefaultsSnapshot?: VocabularyTeachingData['readiness']['defaults']; restoreTopics?: VocabularyTeachingData['curriculum']['topics']; restoreSources?: VocabularyTeachingData['curriculum']['source']; restoreContext?: VocabularyTeachingData['context'] };
    const removed = new Set(baseline.removeCorrections.map(row => JSON.stringify([row.entryId,row.senseId])));
    const restored = new Map(baseline.restoreCorrections.map(row => [JSON.stringify([row.entryId,row.senseId]),row]));
    const removedDefaults = new Set(baseline.removeDefaults || []);
    const restoredDefaults = new Map((baseline.restoreDefaults || []).map(row => [row.entryId,row]));
    const topicIdentity = (row: VocabularyTeachingData['curriculum']['topics'][number]) => JSON.stringify([row.bookId,row.unitId,row.entryId,row.sense.id]);
    const removedTopics = new Set((baseline.removeTopics || []).map(row => JSON.stringify([row.bookId,row.unitId,row.entryId,row.senseId])));
    const topicMembership = (row: VocabularyTeachingData['curriculum']['topics'][number]) => JSON.stringify([row.bookId,row.unitId,row.entryId]);
    const restoredTopicRows = new Map((baseline.restoreTopicRows || []).map(row => [topicMembership(row),row]));
    const variantIdentity = (row: {entryId:string;senseId:string;variantId?:string}) => JSON.stringify([row.entryId,row.senseId,row.variantId]);
    const removedVariants = new Set((baseline.removeCorrectionVariants || []).map(variantIdentity));
    const restoredVariants = new Map((baseline.restoreCorrectionVariants || []).map(row => [variantIdentity(row),row]));
    const nextCorrections = baseline.restoreCorrectionsSnapshot
      ?? (removed.size || restored.size || removedVariants.size || restoredVariants.size
        ? beforeDictionaryExpansion.readiness.corrections
            .filter(row => (!removed.size || !removed.has(JSON.stringify([row.entryId,row.senseId]))) && !(row.variantId && removedVariants.size && removedVariants.has(variantIdentity(row))))
            .map(row => (row.variantId && restoredVariants.size ? restoredVariants.get(variantIdentity(row)) : undefined) || (restored.size ? restored.get(JSON.stringify([row.entryId,row.senseId])) : undefined) || row)
        : beforeDictionaryExpansion.readiness.corrections);
    const nextDefaults = baseline.restoreDefaultsSnapshot
      ?? (removedDefaults.size || restoredDefaults.size
        ? beforeDictionaryExpansion.readiness.defaults
            .filter(row => !removedDefaults.has(row.entryId))
            .map(row => restoredDefaults.get(row.entryId) || row)
        : beforeDictionaryExpansion.readiness.defaults);
    const nextTopics = baseline.restoreTopics
      ?? (removedTopics.size || restoredTopicRows.size
        ? beforeDictionaryExpansion.curriculum.topics
            .filter(row => !removedTopics.has(topicIdentity(row)))
            .map(row => restoredTopicRows.get(topicMembership(row)) || row)
        : beforeDictionaryExpansion.curriculum.topics);
    beforeDictionaryExpansion = {
      ...beforeDictionaryExpansion,
      readiness: { ...beforeDictionaryExpansion.readiness, corrections: nextCorrections, defaults: nextDefaults },
      curriculum: { ...beforeDictionaryExpansion.curriculum, topics: nextTopics, source: baseline.restoreSources ?? beforeDictionaryExpansion.curriculum.source },
      context: baseline.restoreContext ?? beforeDictionaryExpansion.context,
    };
    buildResourceCatalog(source, beforeDictionaryExpansion, cache, resources, true);
  }
  const learningBaseline = data('resourceLearningBaseline') as {
    removeCorrections: {entryId:string; senseId:string}[]; restoreCorrections: VocabularyTeachingData['readiness']['corrections'];
    removeDefaults: string[]; restoreDefaults: VocabularyTeachingData['readiness']['defaults'];
    removeModern: string[]; restoreModern: VocabularyTeachingData['curriculum']['modern'];
  };
  const removedLearningCorrections = new Set(learningBaseline.removeCorrections.map(row => JSON.stringify([row.entryId,row.senseId])));
  const restoredLearningCorrections = new Map(learningBaseline.restoreCorrections.map(row => [JSON.stringify([row.entryId,row.senseId]),row]));
  const removedLearningDefaults = new Set(learningBaseline.removeDefaults);
  const restoredLearningDefaults = new Map(learningBaseline.restoreDefaults.map(row => [row.entryId,row]));
  const removedLearningModern = new Set(learningBaseline.removeModern);
  const restoredLearningModern = new Map(learningBaseline.restoreModern.map(row => [row.entryId,row]));
  const beforeLearningExpansion: VocabularyTeachingData = {
    ...beforeDictionaryExpansion,
    readiness: { ...beforeDictionaryExpansion.readiness,
      corrections: beforeDictionaryExpansion.readiness.corrections.filter(row => !removedLearningCorrections.has(JSON.stringify([row.entryId,row.senseId]))).map(row => restoredLearningCorrections.get(JSON.stringify([row.entryId,row.senseId])) || row),
      defaults: beforeDictionaryExpansion.readiness.defaults.filter(row => !removedLearningDefaults.has(row.entryId)).map(row => restoredLearningDefaults.get(row.entryId) || row),
    },
    curriculum: { ...beforeDictionaryExpansion.curriculum, modern: beforeDictionaryExpansion.curriculum.modern.filter(row => !removedLearningModern.has(row.entryId)).map(row => restoredLearningModern.get(row.entryId) || row) },
  };
  const mapping = data('identityMapping') as { books: {id: string; oldId: string}[]; units: {id: string; oldId: string}[]; memberships: {id: string; oldId: string}[] };
  const legacyIds = new Map([...mapping.books, ...mapping.units, ...mapping.memberships].map(row => [row.id, row.oldId]));
  // Restore the previous teaching content as well as its legacy identities.
  // Rebuilding old resources with today's corrections would change their hashes.
  const baseline = data('resourceReleaseBaseline') as { removeDefaults: string[]; removeCorrections: {entryId: string; senseId: string}[]; restoreRepairs: VocabularyTeachingData['curriculum']['repairs'] };
  const removedDefaults = new Set(baseline.removeDefaults);
  const removedCorrections = new Set(baseline.removeCorrections.map(row=>JSON.stringify([row.entryId,row.senseId])));
  const restoredRepairs = new Map(baseline.restoreRepairs.map(row=>[JSON.stringify([row.entryId,row.sense.id]),row]));
  const previousTeaching: VocabularyTeachingData = {
    ...beforeLearningExpansion,
    readiness: { ...beforeLearningExpansion.readiness, defaults: beforeLearningExpansion.readiness.defaults.filter(row=>!removedDefaults.has(row.entryId)), corrections: beforeLearningExpansion.readiness.corrections.filter(row=>!removedCorrections.has(JSON.stringify([row.entryId,row.senseId]))) },
    curriculum: { ...beforeLearningExpansion.curriculum, repairs: beforeLearningExpansion.curriculum.repairs.map(row=>restoredRepairs.get(JSON.stringify([row.entryId,row.sense.id])) || row) },
  };
  const legacyValue = <T>(value: T): T => {
    if (typeof value === 'string') return (legacyIds.get(value) || value) as T;
    if (Array.isArray(value)) return value.map(legacyValue) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, row]) => [legacyIds.get(key) || key, legacyValue(row)])) as T;
    return value;
  };
  buildResourceCatalog(source, beforeLearningExpansion, cache, resources, true);
  buildResourceCatalog(source, previousTeaching, cache, resources, true);
  buildResourceCatalog(legacyValue(source), legacyValue(previousTeaching), cache, resources, true);
  return generated;
}

// Unlike ordinary deep equality, preserve property order: these values name
// immutable JSON bytes. Shared source rows make unchanged packs cheap to compare.
function sameResourceValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left), otherKeys = Object.keys(right);
  return keys.length === otherKeys.length && keys.every((key, at) => key === otherKeys[at]
    && sameResourceValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function sameArrayElements<T>(left: T[] | undefined, right: T[]): boolean {
  if (left === right) return true;
  if (!left || left.length !== right.length) return false;
  for (let at = 0; at < left.length; at += 1) if (left[at] !== right[at]) return false;
  return true;
}

// Inputs are parsed JSON records and plain objects/arrays assembled by this
// builder. They are immutable throughout one build. Cache native JSON strings
// only for shared pack slices (never leaf nodes) so memory stays bounded.
function stringifyCached(value: object, cache: WeakMap<object, string>): string {
  let text = cache.get(value);
  if (text === undefined) {
    text = JSON.stringify(value);
    cache.set(value, text);
  }
  return text;
}

function teachingJSON(scoped: VocabularyTeachingData, cache: WeakMap<object, string>): string {
  const cached = cache.get(scoped);
  if (cached !== undefined) return cached;
  let curriculum = cache.get(scoped.curriculum);
  if (curriculum === undefined) {
    curriculum = `{"common":${stringifyCached(scoped.curriculum.common, cache)},"topics":${stringifyCached(scoped.curriculum.topics, cache)},"source":${stringifyCached(scoped.curriculum.source, cache)},"repairs":${stringifyCached(scoped.curriculum.repairs, cache)},"modern":${stringifyCached(scoped.curriculum.modern, cache)}}`;
    cache.set(scoped.curriculum, curriculum);
  }
  let readiness = cache.get(scoped.readiness);
  if (readiness === undefined) {
    readiness = `{"core":${stringifyCached(scoped.readiness.core, cache)},"corrections":${stringifyCached(scoped.readiness.corrections, cache)},"defaults":${stringifyCached(scoped.readiness.defaults, cache)}}`;
    cache.set(scoped.readiness, readiness);
  }
  let context = cache.get(scoped.context);
  if (context === undefined) {
    const versionPart = scoped.context.version === undefined ? '' : `"version":${JSON.stringify(scoped.context.version)},`;
    context = `{${versionPart}"bindings":${stringifyCached(scoped.context.bindings, cache)},"defaults":${stringifyCached(scoped.context.defaults, cache)},"unresolved":${stringifyCached(scoped.context.unresolved, cache)}}`;
    cache.set(scoped.context, context);
  }
  const text = `{"senseBaselines":${stringifyCached(scoped.senseBaselines, cache)},"curriculum":${curriculum},"readiness":${readiness},"learning":${stringifyCached(scoped.learning, cache)},"tasks":${stringifyCached(scoped.tasks, cache)},"context":${context}}`;
  cache.set(scoped, text);
  return text;
}

/** Select by identity without rescanning unrelated rows; retain source order. */
function resourceRowIndex<T>(items: T[], identity: (row: T) => string): RowSelector<T> {
  const indexed = new Map<string, { row: T; at: number }[]>();
  items.forEach((row, at) => {
    const key = identity(row), rows = indexed.get(key) || [];
    rows.push({ row, at }); indexed.set(key, rows);
  });
  return (ids: Set<string>): T[] => {
    const selected: { row: T; at: number }[] = [];
    for (const id of ids) selected.push(...(indexed.get(id) || []));
    return selected.sort((a, b) => a.at - b.at).map(item => item.row);
  };
}

function entrySenseBaselines(entries: VocabularyEntry[], cache: ResourceBuildCache): VocabularyTeachingData['senseBaselines'] {
  return Object.fromEntries(entries.map(entry => {
    let senses = cache.baselines.get(entry);
    if (!senses) {
      senses = entry.senses.map(sense => Object.fromEntries(Object.entries(sense).filter(([field]) => BASELINE_FIELDS.has(field)))) as VocabularyTeachingData['senseBaselines'][string];
      cache.baselines.set(entry, senses);
    }
    return [entry.id, senses];
  }));
}

function prepareCatalog(source: Catalog, cache: ResourceBuildCache): PreparedCatalog {
  const existing = cache.prepared.get(source);
  if (existing) return existing;
  const entryMemberships = resourceRowIndex(source.memberships, row => row.entryId);
  const entryIndex = new Map(source.entries.map(entry => [entry.id, entry]));
  const memberships = new Map<string, Membership[]>();
  for (const row of source.memberships) {
    const key = JSON.stringify([row.bookId, row.unitId]);
    const list = memberships.get(key) || [];
    list.push(row); memberships.set(key, list);
  }
  const unitPlans: UnitPlan[] = source.units.map(unit => {
    const members = (memberships.get(JSON.stringify([unit.bookId, unit.id])) || []).sort((a, b) => a.order - b.order);
    const entryIds = [...new Set(members.map(row => row.entryId))];
    const entries = entryIds.map(id => entryIndex.get(id)!);
    if (entries.some(entry => !entry)) throw new Error(`Missing vocabulary entry in ${unit.bookId}/${unit.id}`);
    const idSet = new Set(entryIds);
    const termSet = new Set(entries.map(entry => entry.term.toLowerCase()));
    // CDN servers decode URL paths differently. Use only safe filename bytes,
    // rather than emitting literal percent escapes that Pages decodes on lookup.
    const name = `${Buffer.from(unit.bookId).toString('hex')}-${Buffer.from(unit.id).toString('hex')}`;
    return {
      unit,
      members,
      entryIds,
      entries,
      archivedEntryIds: entries.filter(entry => entry.tags.includes('archived')).map(entry => entry.id),
      idSet,
      termSet,
      name,
      senseBaselines: unit.kind !== 'chapter' ? entrySenseBaselines(entries, cache) : undefined,
      scopeCache: {},
    };
  });
  const shards = new Map<number, VocabularyEntry[]>();
  for (const entry of source.entries) {
    const shard = createHash('sha256').update(entry.id).digest()[0] % 64;
    const entries = shards.get(shard) || []; entries.push(entry); shards.set(shard, entries);
  }
  const entryShards: Record<string, string> = {};
  const shardPlans: ShardPlan[] = [];
  for (const [shard, entries] of shards) {
    const idSet = new Set(entries.map(entry => entry.id));
    const termSet = new Set(entries.map(entry => entry.term.toLowerCase()));
    shardPlans.push({
      shard,
      entries,
      idSet,
      termSet,
      memberships: entryMemberships(idSet),
      senseBaselines: entrySenseBaselines(entries, cache),
      scopeCache: {},
    });
    for (const entry of entries) entryShards[entry.id] = String(shard);
  }
  const terms: Record<string, string[]> = {};
  for (const entry of source.entries) {
    const term = entry.term.normalize('NFKC').toLocaleLowerCase('en').replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ');
    (terms[term] ||= []).push(entry.id);
  }
  const prepared: PreparedCatalog = { unitPlans, shardPlans, entryShards, terms };
  cache.prepared.set(source, prepared);
  return prepared;
}

function buildResourceCatalog(source: Catalog, teaching: VocabularyTeachingData, cache: ResourceBuildCache, resources: VocabularyResourceFiles, includeTermIndex = false) {
  const prepared = prepareCatalog(source, cache);
  const emit = (name: string, value: unknown, serialize: () => string, cacheKey = name) => {
    const previous = cache.emissions.get(cacheKey);
    if (previous && sameResourceValue(previous.value, value)) {
      return previous.url;
    }
    const bytes = Buffer.from(serialize(), 'utf8');
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const url = `/vocabulary-resources/${name}.${hash}.json`;
    const existing = resources.getBytes(url);
    if (existing !== undefined) {
      if (!existing.equals(bytes)) throw new Error(`Vocabulary resource hash collision: ${url}`);
    } else {
      resources.setBytes(url, bytes);
    }
    cache.emissions.set(cacheKey, { value, url });
    return url;
  };
  const byEntry = <T extends { entryId: string }>(items: T[]): RowSelector<T> => {
    let selector = cache.entryIndexes.get(items) as RowSelector<T> | undefined;
    if (!selector) {
      selector = resourceRowIndex(items, row => row.entryId);
      cache.entryIndexes.set(items, selector as RowSelector<unknown>);
    }
    return selector;
  };
  const byRecordKey = <T>(record: Record<string, T>): RowSelector<[string, T]> => {
    let selector = cache.recordIndexes.get(record) as RowSelector<[string, T]> | undefined;
    if (!selector) {
      selector = resourceRowIndex(Object.entries(record), ([term]) => term);
      cache.recordIndexes.set(record, selector as RowSelector<[string, unknown]>);
    }
    return selector;
  };
  const curriculum = {
    common: byEntry(teaching.curriculum.common),
    topics: byEntry(teaching.curriculum.topics),
    source: byEntry(teaching.curriculum.source),
    repairs: byEntry(teaching.curriculum.repairs),
    modern: byEntry(teaching.curriculum.modern),
  };
  const readiness = {
    core: byEntry(teaching.readiness.core),
    corrections: byEntry(teaching.readiness.corrections),
    defaults: byEntry(teaching.readiness.defaults),
  };
  const context = {
    bindings: byEntry(teaching.context.bindings),
    defaults: byEntry(teaching.context.defaults),
    unresolved: byEntry(teaching.context.unresolved),
  };
  const learningRows = byRecordKey(teaching.learning);
  const taskRows = byRecordKey(teaching.tasks.senseIds);

  const selectArraySlice = <T>(
    previous: SliceCacheEntry<T[]> | undefined,
    tableRef: T[],
    selector: RowSelector<T>,
    ids: Set<string>,
  ): SliceCacheEntry<T[]> => {
    if (previous && previous.tableRef === tableRef) return previous;
    const next = selector(ids);
    if (previous && sameArrayElements(previous.value, next)) {
      return { tableRef, value: previous.value };
    }
    return { tableRef, value: next };
  };

  const scopeTeaching = (
    senseBaselines: VocabularyTeachingData['senseBaselines'],
    ids: Set<string>,
    terms: Set<string>,
    scopeCache: ScopeTeachingCache,
  ): VocabularyTeachingData => {
    scopeCache.curriculumCommon = selectArraySlice(scopeCache.curriculumCommon, teaching.curriculum.common, curriculum.common, ids);
    scopeCache.curriculumTopics = selectArraySlice(scopeCache.curriculumTopics, teaching.curriculum.topics, curriculum.topics, ids);
    scopeCache.curriculumSource = selectArraySlice(scopeCache.curriculumSource, teaching.curriculum.source, curriculum.source, ids);
    scopeCache.curriculumRepairs = selectArraySlice(scopeCache.curriculumRepairs, teaching.curriculum.repairs, curriculum.repairs, ids);
    scopeCache.curriculumModern = selectArraySlice(scopeCache.curriculumModern, teaching.curriculum.modern, curriculum.modern, ids);
    scopeCache.readinessCore = selectArraySlice(scopeCache.readinessCore, teaching.readiness.core, readiness.core, ids);
    scopeCache.readinessCorrections = selectArraySlice(scopeCache.readinessCorrections, teaching.readiness.corrections, readiness.corrections, ids);
    scopeCache.readinessDefaults = selectArraySlice(scopeCache.readinessDefaults, teaching.readiness.defaults, readiness.defaults, ids);
    if (!scopeCache.learning || scopeCache.learning.tableRef !== teaching.learning) {
      scopeCache.learning = { tableRef: teaching.learning, value: Object.fromEntries(learningRows(terms)) };
    }
    if (!scopeCache.tasks || scopeCache.tasks.tableRef !== teaching.tasks.senseIds) {
      scopeCache.tasks = { tableRef: teaching.tasks.senseIds, value: { senseIds: Object.fromEntries(taskRows(terms)) } };
    }
    scopeCache.contextBindings = selectArraySlice(scopeCache.contextBindings, teaching.context.bindings, context.bindings, ids);
    scopeCache.contextDefaults = selectArraySlice(scopeCache.contextDefaults, teaching.context.defaults, context.defaults, ids);
    scopeCache.contextUnresolved = selectArraySlice(scopeCache.contextUnresolved, teaching.context.unresolved, context.unresolved, ids);

    const prevCurriculum = scopeCache.curriculum;
    const nextCurriculum = prevCurriculum
      && prevCurriculum.common === scopeCache.curriculumCommon.value
      && prevCurriculum.topics === scopeCache.curriculumTopics.value
      && prevCurriculum.source === scopeCache.curriculumSource.value
      && prevCurriculum.repairs === scopeCache.curriculumRepairs.value
      && prevCurriculum.modern === scopeCache.curriculumModern.value
      ? prevCurriculum
      : {
          common: scopeCache.curriculumCommon.value,
          topics: scopeCache.curriculumTopics.value,
          source: scopeCache.curriculumSource.value,
          repairs: scopeCache.curriculumRepairs.value,
          modern: scopeCache.curriculumModern.value,
        };
    scopeCache.curriculum = nextCurriculum;

    const prevReadiness = scopeCache.readiness;
    const nextReadiness = prevReadiness
      && prevReadiness.core === scopeCache.readinessCore.value
      && prevReadiness.corrections === scopeCache.readinessCorrections.value
      && prevReadiness.defaults === scopeCache.readinessDefaults.value
      ? prevReadiness
      : {
          core: scopeCache.readinessCore.value,
          corrections: scopeCache.readinessCorrections.value,
          defaults: scopeCache.readinessDefaults.value,
        };
    scopeCache.readiness = nextReadiness;

    const prevContext = scopeCache.context;
    const nextContext = prevContext
      && prevContext.version === teaching.context.version
      && prevContext.bindings === scopeCache.contextBindings.value
      && prevContext.defaults === scopeCache.contextDefaults.value
      && prevContext.unresolved === scopeCache.contextUnresolved.value
      ? prevContext
      : {
          version: teaching.context.version,
          bindings: scopeCache.contextBindings.value,
          defaults: scopeCache.contextDefaults.value,
          unresolved: scopeCache.contextUnresolved.value,
        };
    scopeCache.context = nextContext;

    const prevScoped = scopeCache.scoped;
    if (
      prevScoped
      && prevScoped.senseBaselines === senseBaselines
      && prevScoped.curriculum === nextCurriculum
      && prevScoped.readiness === nextReadiness
      && prevScoped.learning === scopeCache.learning.value
      && prevScoped.tasks === scopeCache.tasks.value
      && prevScoped.context === nextContext
    ) {
      return prevScoped;
    }
    const nextScoped: VocabularyTeachingData = {
      senseBaselines,
      curriculum: nextCurriculum,
      readiness: nextReadiness,
      learning: scopeCache.learning.value,
      tasks: scopeCache.tasks.value,
      context: nextContext,
    };
    scopeCache.scoped = nextScoped;
    return nextScoped;
  };

  const units = prepared.unitPlans.map(plan => {
    const scoped = plan.senseBaselines ? scopeTeaching(plan.senseBaselines, plan.idSet, plan.termSet, plan.scopeCache) : undefined;
    const resource = scoped
      ? emit(
          `groups/${plan.name}`,
          { entries: plan.entries, memberships: plan.members, teaching: scoped },
          () => `{"entries":${stringifyCached(plan.entries, cache.serialized)},"memberships":${stringifyCached(plan.members, cache.serialized)},"teaching":${teachingJSON(scoped, cache.serialized)}}`,
        )
      : undefined;
    const teachingResource = resource && scoped
      ? emit(
          `teaching/groups/${plan.name}`,
          { teaching: scoped, memberships: plan.members },
          () => `{"teaching":${teachingJSON(scoped, cache.serialized)},"memberships":${stringifyCached(plan.members, cache.serialized)}}`,
        )
      : undefined;
    return { ...plan.unit, entryIds: plan.entryIds, entryCount: plan.entryIds.length, archivedEntryIds: plan.archivedEntryIds, ...(resource ? { resource, teachingResource } : {}) };
  });
  const entryShards = prepared.entryShards;
  const entryResources: Record<string, string> = {};
  const entryTeachingResources: Record<string, string> = {};
  for (const plan of prepared.shardPlans) {
    const scoped = scopeTeaching(plan.senseBaselines, plan.idSet, plan.termSet, plan.scopeCache);
    const url = emit(
      `entries/${plan.shard}`,
      { entries: plan.entries, memberships: [], teaching: scoped },
      () => `{"entries":${stringifyCached(plan.entries, cache.serialized)},"memberships":[],"teaching":${teachingJSON(scoped, cache.serialized)}}`,
    );
    entryResources[plan.shard] = url;
    entryTeachingResources[plan.shard] = emit(
      `teaching/entries/${plan.shard}`,
      { teaching: scoped, memberships: plan.memberships },
      () => `{"teaching":${teachingJSON(scoped, cache.serialized)},"memberships":${stringifyCached(plan.memberships, cache.serialized)}}`,
    );
  }
  const teachingIndex = { version: 1, bookIds: source.books.map(book => book.id), books: source.books, units, groups: Object.fromEntries(units.filter(unit => unit.teachingResource).map(unit => [JSON.stringify([unit.bookId, unit.id]), unit.teachingResource!])), entryShards, entryTeachingResources };
  const teachingIndexUrl = emit('teaching-index', teachingIndex, () => JSON.stringify(teachingIndex));
  const previousManifest = { version: 1, books: source.books, units, entryCount: source.entries.length, entryShards, entryResources, entryTeachingResources };
  // Older open clients keep using this exact manifest and its content-addressed URL.
  const previousManifestUrl = emit('manifest', previousManifest, () => JSON.stringify(previousManifest), 'manifest-legacy');
  const termIndexUrl = includeTermIndex ? emit('term-index', prepared.terms, () => JSON.stringify(prepared.terms)) : undefined;
  const manifest = { ...previousManifest, ...(termIndexUrl ? { termIndexUrl } : {}) };
  const manifestUrl = termIndexUrl ? emit('manifest', manifest, () => JSON.stringify(manifest), 'manifest') : previousManifestUrl;
  return { manifest, resources, manifestUrl, teachingIndex, teachingIndexUrl };
}

export function vocabularyResourcesPlugin(
  root: string,
  buildResources: typeof buildVocabularyResources = buildVocabularyResources,
): Plugin {
  let generated: ReturnType<typeof buildVocabularyResources> | undefined;
  let generatedIncludesHistory = false;
  let serveMode = false;
  const ensure = (includeHistory = !serveMode) => {
    if (!generated || (includeHistory && !generatedIncludesHistory)) {
      generated = buildResources(root, { includeHistory });
      generatedIncludesHistory = includeHistory;
    }
    return generated;
  };
  return {
    name: 'vocabulary-resources',
    configResolved(config) { serveMode = config.command === 'serve'; },
    buildStart() { ensure(!serveMode); },
    resolveId(id) { if (id === 'virtual:vocabulary-manifest') return '\0virtual:vocabulary-manifest'; },
    load(id) { if (id === '\0virtual:vocabulary-manifest') return `export default ${JSON.stringify(ensure(!serveMode).manifestUrl)}; export const teachingIndexUrl = ${JSON.stringify(ensure(!serveMode).teachingIndexUrl)};`; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (!pathname.startsWith('/vocabulary-resources/')) return next();
        let current = ensure(false);
        let bytes = current.resources.getBytes(pathname);
        if (bytes === undefined && !generatedIncludesHistory) {
          current = ensure(true);
          bytes = current.resources.getBytes(pathname);
        }
        if (bytes === undefined) return next();
        res.setHeader('Cache-Control', pathname === current.manifestUrl || pathname === current.teachingIndexUrl ? REVALIDATE : IMMUTABLE);
        res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(bytes);
      });
    },
    generateBundle() {
      const current = ensure(true);
      for (const [url, source] of current.resources.byteEntries()) this.emitFile({ type: 'asset', fileName: url.slice(1), source });
      const headersPath = path.join(root, 'public/_headers');
      const existing = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8').trimEnd() + '\n\n' : '';
      this.emitFile({ type: 'asset', fileName: '_headers', source: existing + vocabularyResourceHeaders(current.manifestUrl, current.teachingIndexUrl) });
    },
  };
}
