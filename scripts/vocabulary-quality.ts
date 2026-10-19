import { createHash } from 'node:crypto';
import { vocabularySensePresentation } from '../src/domain/vocabulary/dictionaryPresentation';
import type { VocabularySense } from '../src/domain/vocabulary/types';

export type Scope = { kind: 'default' | 'group'; bookId?: string; unitId?: string };
export type QualitySource = { entryId: string; term: string; originalSense: VocabularySense; displaySense: VocabularySense; reviewStatus: 'reviewed' | 'pending'; priority?: string; readingNote?: boolean; referenceOnly?: boolean };
export type QualityLesson = { entryId: string; term: string; sense: VocabularySense; scope: Scope; modes: string[]; readingNote?: boolean; referenceOnly?: boolean };
export const qualitySignals = [
  'missing-definition', 'missing-pos', 'missing-example', 'source-markup', 'relation-example', 'reference-example',
  'truncated-example', 'archaic-example', 'example-fragment-signal', 'missing-collocations',
  'missing-distinctions', 'duplicate-gloss', 'no-cloze-task', 'no-distinction-task',
] as const;
type Signal = typeof qualitySignals[number];
type WorkItem = {
  workItemId: string; entryId: string; term: string; senseId: string; sourceHash: string | null; displayHash: string;
  originalSense: VocabularySense | null; displaySense: VocabularySense;
  reviewStatus: 'reviewed' | 'pending' | 'context-review-required';
  priority: string | null; readingNote: boolean; referenceOnly: boolean;
  scopes: Scope[]; modes: string[] | null; signals: Signal[]; tier: number;
};
export type QualityReport = ReturnType<typeof buildQualityReport>;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (entryId: string, senseId: string) => JSON.stringify([entryId, senseId]);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
const displayHash = (sense: VocabularySense) => hash(stable(sense));
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const populated = (values: string[] | undefined) => Boolean(values?.some(value => value.trim()));

/** Signals prioritise work. They never approve, merge or rewrite lexical records. */
export function buildQualityReport(input: { sources: QualitySource[]; lessons: QualityLesson[] }) {
  const sources = new Map<string, QualitySource>();
  const variants = new Map<string, WorkItem>();
  const duplicates = new Map<string, string[]>();
  for (const source of input.sources) {
    const key = identity(source.entryId, source.originalSense.id);
    if (sources.has(key)) throw new Error('Duplicate source identity: ' + key);
    sources.set(key, source);
    const definition = vocabularySensePresentation(source.displaySense).definition;
    if (definition) {
      const gloss = JSON.stringify([source.entryId, normalized(source.displaySense.pos), normalized(definition)]);
      duplicates.set(gloss, [...(duplicates.get(gloss) || []), key]);
    }
  }
  const duplicateGroups = [...duplicates.values()].filter(rows => rows.length > 1);
  const duplicateIds = new Set(duplicateGroups.flat());
  function variant(entryId: string, term: string, sense: VocabularySense, metadata: { readingNote?: boolean; referenceOnly?: boolean }) {
    const fingerprint = displayHash(sense), key = JSON.stringify([entryId, sense.id, fingerprint]);
    const existing = variants.get(key);
    if (existing) {
      if (existing.readingNote !== Boolean(metadata.readingNote) || existing.referenceOnly !== Boolean(metadata.referenceOnly)) throw new Error('Conflicting exact-content metadata: ' + key);
      return existing;
    }
    const source = sources.get(identity(entryId, sense.id));
    if (source && source.term !== term) throw new Error('Source term mismatch: ' + entryId);
    const matchesSource = source && displayHash(source.displaySense) === fingerprint;
    const item: WorkItem = {
      workItemId: 'vq:' + hash(key), entryId, term, senseId: sense.id,
      sourceHash: source ? hash(source.originalSense) : null, displayHash: fingerprint,
      originalSense: source ? structuredClone(source.originalSense) : null, displaySense: structuredClone(sense),
      reviewStatus: matchesSource ? source.reviewStatus : 'context-review-required',
      priority: matchesSource ? source.priority || null : null,
      readingNote: Boolean(metadata.readingNote), referenceOnly: Boolean(metadata.referenceOnly),
      scopes: [], modes: null, signals: [], tier: 2,
    };
    variants.set(key, item); return item;
  }
  for (const source of input.sources) variant(source.entryId, source.term, source.displaySense, source);
  for (const lesson of input.lessons) {
    const item = variant(lesson.entryId, lesson.term, lesson.sense, lesson);
    if (!item.scopes.some(scope => JSON.stringify(stable(scope)) === JSON.stringify(stable(lesson.scope)))) item.scopes.push({ ...lesson.scope });
    if (item.modes && JSON.stringify(item.modes) !== JSON.stringify([...new Set(lesson.modes)].sort(compare))) throw new Error('Conflicting exact-content task availability: ' + item.workItemId);
    item.modes = [...new Set(lesson.modes)].sort(compare);
  }
  for (const item of variants.values()) {
    const sense = item.displaySense, presented = vocabularySensePresentation(sense), flags = new Set<Signal>();
    if (!presented.definition) flags.add('missing-definition');
    if (!sense.pos?.trim()) flags.add('missing-pos');
    if (!presented.example && !item.referenceOnly) flags.add('missing-example');
    if (/\{\{|\[\[|<\/?(?:ref|span|div|small)\b/i.test(sense.definition + ' ' + sense.example)) flags.add('source-markup');
    if (/^\s*(?:Near[- ]synonyms?|Synonyms?|Antonyms?|Meronyms?|Holonyms?|Hypernyms?|Hyponyms?|Coordinate terms?|Related terms?|Derived terms?)\s*:/i.test(sense.example)) flags.add('relation-example');
    if (sense.example?.trim() && !presented.example && !flags.has('relation-example')) flags.add('reference-example');
    if (!item.readingNote && !item.referenceOnly) {
      if (/\[\s*(?:…|\.{3})\s*\]|\{\{\.\.\.\}\}/.test(sense.example)) flags.add('truncated-example');
      if (/\b(?:thou|thee|thy|thine|hath|doth)\b|ſ/i.test(sense.example)) flags.add('archaic-example');
      if (presented.example && !/[.!?…][”"’')\]]*$/.test(presented.example)) flags.add('example-fragment-signal');
      if (!populated(sense.collocations)) flags.add('missing-collocations');
      if (!populated(sense.distinctions)) flags.add('missing-distinctions');
      if (item.modes) for (const mode of ['cloze', 'distinction'] as const) if (!item.modes.includes(mode)) flags.add(`no-${mode}-task`);
    }
    if (duplicateIds.has(identity(item.entryId, item.senseId)) && sources.get(identity(item.entryId, item.senseId))?.displaySense.definition === sense.definition) flags.add('duplicate-gloss');
    item.signals = qualitySignals.filter(flag => flags.has(flag));
    const critical = item.signals.some(flag => ['missing-definition', 'missing-pos', 'missing-example', 'source-markup', 'relation-example', 'reference-example'].includes(flag));
    item.tier = item.scopes.length && item.signals.length ? critical ? 0 : 1 : ['specialist', 'historical', 'proper-name'].includes(item.priority || '') ? 3 : 2;
    item.scopes.sort((a, b) => compare(JSON.stringify(stable(a)), JSON.stringify(stable(b))));
  }
  const work = [...variants.values()].sort((a, b) => a.tier - b.tier || b.scopes.length - a.scopes.length || compare(a.term, b.term) || compare(a.senseId, b.senseId) || compare(a.displayHash, b.displayHash));
  const learning = work.filter(row => row.scopes.length);
  const byIssue = Object.fromEntries(qualitySignals.map(flag => [flag, { dictionary: flag.startsWith('no-') ? null : work.filter(row => row.originalSense && row.signals.includes(flag) && row.reviewStatus !== 'context-review-required').length, learning: learning.filter(row => row.signals.includes(flag)).length }]));
  return {
    schemaVersion: 1,
    scope: 'Public source and runtime-selected teaching variants; automatic signals are not semantic approval or mastery.',
    summary: {
      dictionarySenses: sources.size, reviewed: input.sources.filter(row => row.reviewStatus === 'reviewed').length,
      pending: input.sources.filter(row => row.reviewStatus === 'pending').length,
      learningEntries: new Set(learning.map(row => row.entryId)).size, learningVariants: learning.length,
      learningContexts: learning.reduce((sum, row) => sum + row.scopes.length, 0),
      learningWithExamples: learning.filter(row => vocabularySensePresentation(row.displaySense).example).length,
      learningWithCollocations: learning.filter(row => populated(row.displaySense.collocations)).length,
      learningWithDistinctions: learning.filter(row => populated(row.displaySense.distinctions)).length,
      learningWithCloze: learning.filter(row => row.modes?.includes('cloze')).length,
      learningWithDistinctionTask: learning.filter(row => row.modes?.includes('distinction')).length,
      learningWithoutSignals: learning.filter(row => !row.signals.length).length,
      duplicateGlossGroups: duplicateGroups.length,
    },
    byIssue, work,
  };
}

export function exportQualityWork(report: QualityReport, options: { scope?: string; issue?: string; limit?: number; offset?: number } = {}) {
  const { scope = 'all', issue, limit = 200, offset = 0 } = options;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid limit: use 1–1000.');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset.');
  if (!['all', 'learning', 'reference'].includes(scope)) throw new Error('Invalid scope.');
  if (issue && !qualitySignals.includes(issue as Signal)) throw new Error('Invalid issue.');
  const matching = report.work.filter(row => (scope === 'all' || (scope === 'learning' ? row.scopes.length > 0 : row.scopes.length === 0)) && (!issue || row.signals.includes(issue as Signal)));
  return { schemaVersion: 1, scope, issue: issue || null, total: matching.length, offset, limit,
    items: matching.slice(offset, offset + limit).map(row => ({ ...row, status: 'candidate-required' as const })),
  };
}

/** Validate offline candidates without modifying teaching data or the review ledger. */
export function validateQualityCandidates(report: QualityReport, candidates: unknown[]) {
  const work = new Map(report.work.map(row => [row.workItemId, row])), seen = new Set<string>(), errors: string[] = [];
  const allowed = new Set(['workItemId', 'sourceHash', 'displayHash', 'definition', 'example', 'pos', 'usage', 'register', 'collocations', 'distinctions', 'exampleKind', 'learningPriority', 'referenceUrl', 'distinctionTask']);
  let structurallyValid = 0;
  const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
  for (const [index, value] of candidates.entries()) {
    const start = errors.length, fail = (message: string) => errors.push(`Candidate ${index + 1}: ${message}`);
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail('Expected an object.'); continue; }
    const row = value as Record<string, unknown>, id = typeof row.workItemId === 'string' ? row.workItemId : '', item = work.get(id);
    if (!item) fail('Unknown work identity.');
    if (seen.has(id)) fail('Duplicate work identity.');
    seen.add(id);
    if (item && row.sourceHash !== item.sourceHash) fail('Stale source hash.');
    if (item && row.displayHash !== item.displayHash) fail('Stale displayed-content hash.');
    for (const key of Object.keys(row)) if (!allowed.has(key)) fail('Unsupported field (approval is not accepted): ' + key);
    for (const key of ['definition', 'example']) if (!text(row[key]) || /\b(?:TODO|TBD)\b|definition pending|example pending/.test(String(row[key]))) fail('Missing or placeholder ' + key + '.');
    for (const key of ['pos', 'usage', 'register']) if (row[key] !== undefined && !text(row[key])) fail('Invalid ' + key + '.');
    for (const key of ['collocations', 'distinctions']) {
      const values = row[key];
      if (!Array.isArray(values) || !values.length || !values.every(text) || new Set(values.filter(text).map(normalized)).size !== values.length) fail('Missing, blank or repeated ' + key + '.');
    }
    try { const url = new URL(String(row.referenceUrl)); if (url.protocol !== 'https:' || url.username || url.password) fail('Expected an HTTPS reference URL.'); } catch { fail('Invalid reference URL.'); }
    if (row.exampleKind !== undefined && row.exampleKind !== 'reading-note') fail('Invalid example kind.');
    if (row.learningPriority !== undefined && !['general', 'specialist', 'historical', 'proper-name'].includes(String(row.learningPriority))) fail('Invalid learning priority.');
    if (row.distinctionTask !== undefined) {
      const task = row.distinctionTask as Record<string, unknown> | null;
      if (!task || Array.isArray(task) || typeof task !== 'object' || !text(task.prompt) || !task.prompt.includes('_____') || !Array.isArray(task.options) || task.options.length < 2 || !task.options.every(text) || new Set(task.options.filter(text).map(normalized)).size !== task.options.length || !text(task.answer) || !task.options.includes(task.answer) || !text(task.explanation) || Object.keys(task).some(key => !['prompt', 'options', 'answer', 'explanation'].includes(key))) fail('Invalid distinction task.');
    }
    if (errors.length === start) structurallyValid++;
  }
  return { candidates: candidates.length, structurallyValid, readyForPublication: 0, semanticReviewRequired: structurallyValid, errors };
}
