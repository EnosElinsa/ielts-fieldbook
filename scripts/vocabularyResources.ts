import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import type { VocabularyTeachingData } from '../src/domain/vocabulary/runtimeData';
import type { VocabularyEntry } from '../src/domain/vocabulary/types';

type Unit = { id: string; bookId: string; kind: string; entryIds: string[]; entryCount: number; archivedEntryIds: string[]; resource?: string; teachingResource?: string; [key: string]: unknown };
type Membership = { id: string; bookId: string; unitId: string; entryId: string; order: number };
type Catalog = { entries: VocabularyEntry[]; books: { id: string }[]; units: Unit[]; memberships: Membership[] };
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
  const generated = buildResourceCatalog(source, teaching);
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
    retainedDictionaryCatalogs.push(buildResourceCatalog(source, beforeDictionaryExpansion));
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
  const retained = [...retainedDictionaryCatalogs,buildResourceCatalog(source,beforeLearningExpansion),buildResourceCatalog(source,previousTeaching),buildResourceCatalog(legacyValue(source),legacyValue(previousTeaching))];
  for (const previous of retained) for (const [url, content] of previous.resources) {
    const existing = generated.resources.get(url);
    if (existing !== undefined && existing !== content) throw new Error(`Vocabulary resource hash collision: ${url}`);
    if (existing === undefined) generated.resources.set(url, content);
  }
  return generated;
}

function buildResourceCatalog(source: Catalog, teaching: VocabularyTeachingData) {
  const baselineFields = new Set(['id', 'definition', 'example', 'pos', 'collocations', 'usage', 'synonyms', 'antonyms', 'distinctions', 'distinctionTask', 'wordFamily', 'register', 'source']);
  const resources = new Map<string, string>();
  const emit = (name: string, value: unknown) => {
    const text = JSON.stringify(value);
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const url = `/vocabulary-resources/${name}.${hash}.json`;
    resources.set(url, text);
    return url;
  };
  const scopeTeaching = (entries: VocabularyEntry[]): VocabularyTeachingData => {
    const ids = new Set(entries.map(entry => entry.id));
    const terms = new Set(entries.map(entry => entry.term.toLowerCase()));
    const rows = <T extends { entryId: string }>(items: T[]) => items.filter(row => ids.has(row.entryId));
    return {
      senseBaselines: Object.fromEntries(entries.map(entry => [entry.id, entry.senses.map(sense => {
        return Object.fromEntries(Object.entries(sense).filter(([field]) => baselineFields.has(field)));
      })])) as VocabularyTeachingData['senseBaselines'],
      curriculum: { common: rows(teaching.curriculum.common), topics: rows(teaching.curriculum.topics), source: rows(teaching.curriculum.source), repairs: rows(teaching.curriculum.repairs), modern: rows(teaching.curriculum.modern) },
      readiness: { core: rows(teaching.readiness.core), corrections: rows(teaching.readiness.corrections), defaults: rows(teaching.readiness.defaults) },
      learning: Object.fromEntries(Object.entries(teaching.learning).filter(([term]) => terms.has(term))),
      tasks: { senseIds: Object.fromEntries(Object.entries(teaching.tasks.senseIds).filter(([term]) => terms.has(term))) },
      context: { version: teaching.context.version, bindings: rows(teaching.context.bindings), defaults: rows(teaching.context.defaults), unresolved: rows(teaching.context.unresolved) },
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
    const scoped = scopeTeaching(entries);
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
    entryTeachingResources[shard] = emit(`teaching/entries/${shard}`, { teaching: scoped, memberships: source.memberships.filter(row => ids.has(row.entryId)) });
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
