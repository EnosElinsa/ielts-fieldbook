import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import type { VocabularyTeachingData } from '../src/domain/vocabulary/runtimeData';
import type { VocabularyEntry } from '../src/domain/vocabulary/types';

type Unit = { id: string; bookId: string; kind: string; entryIds: string[]; entryCount: number; archivedEntryIds: string[]; resource?: string; teachingResource?: string; [key: string]: unknown };
type Membership = { id: string; bookId: string; unitId: string; entryId: string; order: number };
type Catalog = { entries: VocabularyEntry[]; books: { id: string }[]; units: Unit[]; memberships: Membership[] };
type ResourceBuildCache = {
  baselines: WeakMap<VocabularyEntry, VocabularyTeachingData['senseBaselines'][string]>;
  emissions: Map<string, { value: unknown; url: string; text: string }>;
  serialized: WeakMap<object, string>;
};
const REVALIDATE = 'public, max-age=0, must-revalidate';
const IMMUTABLE = 'public, max-age=31536000, immutable';
export function vocabularyResourceHeaders(manifestUrl: string, teachingIndexUrl: string): string {
  return [
    [manifestUrl, REVALIDATE], [teachingIndexUrl, REVALIDATE],
    ['/vocabulary-resources/groups/*', IMMUTABLE], ['/vocabulary-resources/entries/*', IMMUTABLE], ['/vocabulary-resources/teaching/*', IMMUTABLE],
  ].map(([url, policy]) => `${url}\n  Cache-Control: ${policy}\n`).join('\n');
}
export function buildVocabularyResources(root: string) {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const source = read('public/vocabulary-catalog.json') as Catalog;
  const data = (file: string) => read(`src/domain/vocabulary/${file}.json`);
  const teaching: VocabularyTeachingData = {
    senseBaselines: {},
    curriculum: { common: data('groupCurriculumCommon'), topics: [...data('groupCurriculumTopicsA'), ...data('groupCurriculumTopicsB'), ...data('groupCurriculumTopicsC')], source: data('groupCurriculumSource'), repairs: data('groupCurriculumRepairs'), modern: data('groupCurriculumModernDefaults') },
    readiness: { core: [...data('readinessContent0'), ...data('readinessContent1'), ...data('readinessContent2')], corrections: data('readinessCorrections'), defaults: data('readinessDefaults') },
    learning: data('learningSenseOverlay'), tasks: data('taskSenseBindings'), context: data('contextSenseOverlay'),
  };
  const cache: ResourceBuildCache = { baselines: new WeakMap(), emissions: new Map(), serialized: new WeakMap() };
  const catalog = (entries: Catalog, content: VocabularyTeachingData) => buildResourceCatalog(entries, content, cache);
  const generated = catalog(source, teaching);
  // Reverse each published correction batch in order to preserve its exact URLs and bytes.
  const retainedDictionaryCatalogs = [];
  let beforeDictionaryExpansion = teaching;
  for (const filename of data('resourceDictionaryRevisions') as string[]) {
    const baseline = data(filename) as { removeCorrections: {entryId:string; senseId:string}[]; restoreCorrections: VocabularyTeachingData['readiness']['corrections']; removeDefaults?: string[]; restoreDefaults?: VocabularyTeachingData['readiness']['defaults'] };
    const removed = new Set(baseline.removeCorrections.map(row => JSON.stringify([row.entryId,row.senseId])));
    const restored = new Map(baseline.restoreCorrections.map(row => [JSON.stringify([row.entryId,row.senseId]),row]));
    const removedDefaults = new Set(baseline.removeDefaults || []);
    const restoredDefaults = new Map((baseline.restoreDefaults || []).map(row => [row.entryId,row]));
    beforeDictionaryExpansion = { ...beforeDictionaryExpansion, readiness: { ...beforeDictionaryExpansion.readiness,
      corrections: beforeDictionaryExpansion.readiness.corrections.filter(row => !removed.has(JSON.stringify([row.entryId,row.senseId]))).map(row => restored.get(JSON.stringify([row.entryId,row.senseId])) || row),
      defaults: beforeDictionaryExpansion.readiness.defaults.filter(row => !removedDefaults.has(row.entryId)).map(row => restoredDefaults.get(row.entryId) || row),
    } };
    retainedDictionaryCatalogs.push(catalog(source, beforeDictionaryExpansion));
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
    curriculum: { ...teaching.curriculum, modern: teaching.curriculum.modern.filter(row => !removedLearningModern.has(row.entryId)).map(row => restoredLearningModern.get(row.entryId) || row) },
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
  const retained = [...retainedDictionaryCatalogs,catalog(source,beforeLearningExpansion),catalog(source,previousTeaching),catalog(legacyValue(source),legacyValue(previousTeaching))];
  for (const previous of retained) for (const [url, content] of previous.resources) {
    const existing = generated.resources.get(url);
    if (existing !== undefined && existing !== content) throw new Error(`Vocabulary resource hash collision: ${url}`);
    if (existing === undefined) generated.resources.set(url, content);
  }
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

// Inputs are parsed JSON records and plain objects/arrays assembled by this
// builder. They are immutable throughout one build. Retain their serialized
// fragments across historical projections without sharing cache across builds.
function resourceJSON(value: unknown, cache: WeakMap<object, string>): string | undefined {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const cached = cache.get(value);
  if (cached !== undefined) return cached;
  const text = Array.isArray(value)
    ? `[${value.map(item => resourceJSON(item, cache) ?? 'null').join(',')}]`
    : `{${Object.entries(value).flatMap(([key, item]) => {
      const serialized = resourceJSON(item, cache);
      return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
    }).join(',')}}`;
  cache.set(value, text);
  return text;
}

/** Select by identity without rescanning unrelated rows; retain source order. */
function resourceRowIndex<T>(items: T[], identity: (row: T) => string) {
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

function buildResourceCatalog(source: Catalog, teaching: VocabularyTeachingData, cache: ResourceBuildCache) {
  const baselineFields = new Set(['id', 'definition', 'example', 'pos', 'collocations', 'usage', 'synonyms', 'antonyms', 'distinctions', 'distinctionTask', 'wordFamily', 'register', 'source']);
  const resources = new Map<string, string>();
  const emit = (name: string, value: unknown) => {
    const previous = cache.emissions.get(name);
    if (previous && sameResourceValue(previous.value, value)) {
      resources.set(previous.url, previous.text);
      return previous.url;
    }
    const text = resourceJSON(value, cache.serialized)!;
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const url = `/vocabulary-resources/${name}.${hash}.json`;
    resources.set(url, text);
    cache.emissions.set(name, { value, url, text });
    return url;
  };
  const byEntry = <T extends { entryId: string }>(items: T[]) => resourceRowIndex(items, row => row.entryId);
  const curriculum = { common: byEntry(teaching.curriculum.common), topics: byEntry(teaching.curriculum.topics), source: byEntry(teaching.curriculum.source), repairs: byEntry(teaching.curriculum.repairs), modern: byEntry(teaching.curriculum.modern) };
  const readiness = { core: byEntry(teaching.readiness.core), corrections: byEntry(teaching.readiness.corrections), defaults: byEntry(teaching.readiness.defaults) };
  const context = { bindings: byEntry(teaching.context.bindings), defaults: byEntry(teaching.context.defaults), unresolved: byEntry(teaching.context.unresolved) };
  const learningRows = resourceRowIndex(Object.entries(teaching.learning), ([term]) => term);
  const taskRows = resourceRowIndex(Object.entries(teaching.tasks.senseIds), ([term]) => term);
  const entryMemberships = byEntry(source.memberships);
  const scopeTeaching = (entries: VocabularyEntry[]): VocabularyTeachingData => {
    const ids = new Set(entries.map(entry => entry.id));
    const terms = new Set(entries.map(entry => entry.term.toLowerCase()));
    return {
      senseBaselines: Object.fromEntries(entries.map(entry => {
        let senses = cache.baselines.get(entry);
        if (!senses) {
          senses = entry.senses.map(sense => Object.fromEntries(Object.entries(sense).filter(([field]) => baselineFields.has(field)))) as VocabularyTeachingData['senseBaselines'][string];
          cache.baselines.set(entry, senses);
        }
        return [entry.id, senses];
      })),
      curriculum: { common: curriculum.common(ids), topics: curriculum.topics(ids), source: curriculum.source(ids), repairs: curriculum.repairs(ids), modern: curriculum.modern(ids) },
      readiness: { core: readiness.core(ids), corrections: readiness.corrections(ids), defaults: readiness.defaults(ids) },
      learning: Object.fromEntries(learningRows(terms)),
      tasks: { senseIds: Object.fromEntries(taskRows(terms)) },
      context: { version: teaching.context.version, bindings: context.bindings(ids), defaults: context.defaults(ids), unresolved: context.unresolved(ids) },
    };
  };
  const entryIndex = new Map(source.entries.map(entry => [entry.id, entry]));
  const memberships = new Map<string, Membership[]>();
  for (const row of source.memberships) {
    const key = JSON.stringify([row.bookId, row.unitId]);
    const list = memberships.get(key) || [];
    list.push(row); memberships.set(key, list);
  }
  const units = source.units.map(unit => {
    const members = (memberships.get(JSON.stringify([unit.bookId, unit.id])) || []).sort((a, b) => a.order - b.order);
    const entryIds = [...new Set(members.map(row => row.entryId))];
    const entries = entryIds.map(id => entryIndex.get(id)!);
    if (entries.some(entry => !entry)) throw new Error(`Missing vocabulary entry in ${unit.bookId}/${unit.id}`);
    const scoped = unit.kind !== 'chapter' ? scopeTeaching(entries) : undefined;
    // CDN servers decode URL paths differently. Use only safe filename bytes,
    // rather than emitting literal percent escapes that Pages decodes on lookup.
    const name = `${Buffer.from(unit.bookId).toString('hex')}-${Buffer.from(unit.id).toString('hex')}`;
    const resource = unit.kind !== 'chapter' ? emit(`groups/${name}`, { entries, memberships: members, teaching: scoped }) : undefined;
    const teachingResource = resource ? emit(`teaching/groups/${name}`, { teaching: scoped, memberships: members }) : undefined;
    return { ...unit, entryIds, entryCount: entryIds.length, archivedEntryIds: entries.filter(entry => entry.tags.includes('archived')).map(entry => entry.id), ...(resource ? { resource, teachingResource } : {}) };
  });
  const shards = new Map<number, VocabularyEntry[]>();
  for (const entry of source.entries) {
    const shard = createHash('sha256').update(entry.id).digest()[0] % 64;
    const entries = shards.get(shard) || []; entries.push(entry); shards.set(shard, entries);
  }
  const entryShards: Record<string, string> = {};
  const entryResources: Record<string, string> = {};
  const entryTeachingResources: Record<string, string> = {};
  for (const [shard, entries] of shards) {
    const scoped = scopeTeaching(entries);
    const url = emit(`entries/${shard}`, { entries, memberships: [], teaching: scoped });
    entryResources[shard] = url;
    const ids = new Set(entries.map(entry => entry.id));
    entryTeachingResources[shard] = emit(`teaching/entries/${shard}`, { teaching: scoped, memberships: entryMemberships(ids) });
    for (const entry of entries) entryShards[entry.id] = String(shard);
  }
  const teachingIndex = { version: 1, bookIds: source.books.map(book => book.id), books: source.books, units, groups: Object.fromEntries(units.filter(unit => unit.teachingResource).map(unit => [JSON.stringify([unit.bookId, unit.id]), unit.teachingResource!])), entryShards, entryTeachingResources };
  const teachingIndexUrl = emit('teaching-index', teachingIndex);
  const manifest = { version: 1, books: source.books, units, entryCount: source.entries.length, entryShards, entryResources, entryTeachingResources };
  const manifestUrl = emit('manifest', manifest);
  return { manifest, resources, manifestUrl, teachingIndex, teachingIndexUrl };
}

export function vocabularyResourcesPlugin(root: string): Plugin {
  let generated: ReturnType<typeof buildVocabularyResources>;
  const ensure = () => generated ||= buildVocabularyResources(root);
  return {
    name: 'vocabulary-resources',
    buildStart() { ensure(); },
    resolveId(id) { if (id === 'virtual:vocabulary-manifest') return '\0virtual:vocabulary-manifest'; },
    load(id) { if (id === '\0virtual:vocabulary-manifest') return `export default ${JSON.stringify(ensure().manifestUrl)}; export const teachingIndexUrl = ${JSON.stringify(ensure().teachingIndexUrl)};`; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        const generated = ensure();
        const text = generated.resources.get(pathname);
        if (text === undefined) return next();
        res.setHeader('Cache-Control', pathname === generated.manifestUrl || pathname === generated.teachingIndexUrl ? REVALIDATE : IMMUTABLE);
        res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(text);
      });
    },
    generateBundle() {
      const generated = ensure();
      for (const [url, source] of generated.resources) this.emitFile({ type: 'asset', fileName: url.slice(1), source });
      const headersPath = path.join(root, 'public/_headers');
      const existing = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8').trimEnd() + '\n\n' : '';
      this.emitFile({ type: 'asset', fileName: '_headers', source: existing + vocabularyResourceHeaders(generated.manifestUrl, generated.teachingIndexUrl) });
    },
  };
}
