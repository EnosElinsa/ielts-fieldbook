import { learningTask } from './content';
import { resolveVocabularyLearningContext } from './context';
export { resolveVocabularyLearningContext, VOCABULARY_CONTEXT_VERSION } from './context';
export type { VocabularyLearningContext, VocabularyContextRequest, ResolvedVocabularyLearningContext } from './context';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { hashText, makeId, nowIso } from '../utils';
import { VOCABULARY_CATALOG } from './catalog';
import type { DimensionState, ReviewCard, ReviewQueueFilter, VocabularyDimension, VocabularyEntry, VocabularyEvidence, VocabularyMode, VocabularyResult, VocabularySense, VocabularySource, VocabularyState, VocabularyStatus, VocabularyStore } from './types';
export type * from './types';

export const vocabularyLists = ['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularyImportBatches'] as const;
export const VOCABULARY_MODES: VocabularyMode[] = ['dictation', 'definition', 'cloze', 'synonym', 'distinction', 'production'];
export const VOCABULARY_DIMENSIONS: VocabularyDimension[] = ['meaning', 'listening', 'spelling', 'usage'];
export const VOCABULARY_STATUSES: VocabularyStatus[] = ['new', 'unfamiliar', 'unstable', 'active', 'familiar', 'mastered'];
const modeDimensions: Record<VocabularyMode, VocabularyDimension[]> = {
  dictation: ['listening', 'spelling'], definition: ['meaning'], cloze: ['meaning', 'usage'], synonym: ['meaning'], distinction: ['meaning', 'usage'], production: ['usage'],
};
const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false });
const han = /[\u3400-\u9fff\uf900-\ufaff]/u;
const english = (value: unknown) => typeof value === 'string' && !han.test(value) ? value.trim() : '';
const englishList = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.map(english).filter(Boolean))] : typeof value === 'string' ? value.split(/[;,]/).map(english).filter(Boolean) : [];
export function normalizeAnswer(value: unknown) { return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en').replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' '); }
export function vocabularyKey(term: unknown) { return normalizeAnswer(term); }
function validTime(value: unknown, fallback = nowIso()) { const date = new Date(String(value || '')); return Number.isNaN(date.getTime()) ? fallback : date.toISOString(); }

function ensureStore(state: Partial<VocabularyStore>): asserts state is VocabularyStore {
  vocabularyLists.forEach(key => { if (!Array.isArray(state[key])) Object.assign(state, { [key]: [] }); });
}
function freshDimension(): DimensionState { return { successes: 0, failures: 0, partials: 0 }; }
function ensureLearning(state: VocabularyStore, entry: VocabularyEntry, senseId?: string): VocabularyState {
  const sense = entry.senses.find(item => item.id === senseId) || entry.senses[0];
  const existing = state.vocabularyStates.find(item => item.entryId === entry.id && item.senseId === sense.id);
  if (existing) return existing;
  const learning: VocabularyState = {
    id: `vs-${hashText(`${entry.id}:${sense.id}`)}`, entryId: entry.id, senseId: sense.id, manualStatus: 'new',
    dimensions: { meaning: freshDimension(), listening: freshDimension(), spelling: freshDimension(), usage: freshDimension() },
    cards: {}, wrong: { active: false, successesSinceFailure: 0, modes: {} }, reviewCount: 0, updatedAt: nowIso(),
  };
  state.vocabularyStates.push(learning); return learning;
}

export function addVocabularyItem(state: Partial<VocabularyStore>, input: Partial<VocabularyEntry> & { skill?: VocabularySource['skill']; source?: string; meaning?: string; sourceId?: string; sourceType?: VocabularySource['type']; senseId?: string }, deps?: { now?: () => string; id?: () => string }) {
  ensureStore(state);
  const term = english(input.term);
  if (!term) return { item: null, duplicate: false, invalid: true, reason: 'Enter an English word, expression, or pattern.' };
  const key = vocabularyKey(term);
  const catalog = VOCABULARY_CATALOG.entries.find(item => vocabularyKey(item.term) === key) as unknown as VocabularyEntry | undefined;
  const timestamp = (deps?.now || nowIso)();
  let item = state.vocabulary.find(entry => vocabularyKey(entry.term) === key);
  const duplicate = Boolean(item);
  if (!item) {
    const preferredId = input.id || catalog?.id || `ve-${hashText(key)}`;
    let entryId = preferredId; let suffix = 1;
    while (state.vocabulary.some(entry => entry.id === entryId)) entryId = `${preferredId}-${suffix++}`;
    item = {
      id: entryId, term: catalog?.term || term,
      category: input.category || catalog?.category || (term.includes(' ') ? 'phrase' : 'word'),
      meaning: '', example: '', tags: [], sources: [], senses: [], createdAt: timestamp, updatedAt: timestamp,
      ...(catalog?.pronunciation ? { pronunciation: structuredClone(catalog.pronunciation) } : {}),
    };
    state.vocabulary.push(item);
  }
  const definition = english(input.meaning);
  let senses: Partial<VocabularySense>[] = input.senses?.length ? input.senses : definition ? [{ id: input.senseId, definition, example: english(input.example), pos: 'expression', source: 'Personal note' }] : catalog?.senses || [];
  if (!senses.length && !item.senses.length) senses = [{ definition: '', example: english(input.example), pos: 'expression' }];
  const addedSenseIds: string[] = [];
  const senseAliases = new Map<string, string>();
  senses.forEach(raw => {
    const cleaned = english(raw.definition);
    let sense = item!.senses.find(current => normalizeAnswer(current.definition) === normalizeAnswer(cleaned));
    if (!sense && item!.senses.length === 1 && !item!.senses[0].definition && cleaned) {
      sense = item!.senses[0];
      Object.assign(sense, { definition: cleaned, example: english(raw.example), pos: english(raw.pos) || 'expression', collocations: englishList(raw.collocations), usage: english(raw.usage), synonyms: englishList(raw.synonyms), antonyms: englishList(raw.antonyms), distinctions: englishList(raw.distinctions), source: english(raw.source) || 'Personal note', license: english(raw.license), attribution: english(raw.attribution), sourceUrl: english(raw.sourceUrl) });
    }
    if (!sense) {
      const requestedId = english(raw.id);
      let senseId = requestedId || `sense-${hashText(`${key}:${normalizeAnswer(cleaned)}`)}`;
      if (item!.senses.some(current => current.id === senseId && normalizeAnswer(current.definition) !== normalizeAnswer(cleaned))) senseId = `${senseId}-${hashText(normalizeAnswer(cleaned)).slice(0, 8)}`;
      sense = {
        id: senseId, definition: cleaned,
        example: english(raw.example), pos: english(raw.pos) || 'expression',
        collocations: englishList(raw.collocations), synonyms: englishList(raw.synonyms), antonyms: englishList(raw.antonyms), distinctions: englishList(raw.distinctions),
        usage: english(raw.usage), source: english(raw.source) || 'Personal note', license: english(raw.license), attribution: english(raw.attribution), sourceUrl: english(raw.sourceUrl),
      };
      item!.senses.push(sense);
    } else if (!sense.example && english(raw.example)) sense.example = english(raw.example);
    if (cleaned && !sense.definition) sense.definition = cleaned;
    addedSenseIds.push(sense.id);
    if (raw.id) senseAliases.set(raw.id, sense.id);
    ensureLearning(state, item!, sense.id);
  });
  item.meaning = item.senses[0]?.definition || '';
  item.example = item.senses[0]?.example || english(input.example) || item.example;
  item.enrichmentPending = item.senses.every(sense => !sense.definition);
  item.tags = [...new Set(item.tags.concat(englishList(input.tags)))];
  const sources: VocabularySource[] = input.sources?.length ? input.sources : [{ type: input.sourceType || input.skill || 'personal', id: english(input.sourceId || input.source) || 'personal', ...(input.skill ? { skill: input.skill } : {}) }];
  sources.forEach(raw => {
    const sourceSenseId = (raw.senseId ? senseAliases.get(raw.senseId) || raw.senseId : undefined) || (addedSenseIds.length === 1 ? addedSenseIds[0] : input.senseId);
    const source = { ...raw, context: english(raw.context), id: english(raw.id) || raw.type, ...(sourceSenseId ? { senseId: sourceSenseId } : {}) };
    if (!item!.sources.some(current => current.type === source.type && current.id === source.id && current.bookId === source.bookId && current.unitId === source.unitId && current.senseId === source.senseId && current.skill === source.skill)) item!.sources.push(source);
  });
  item.updatedAt = timestamp;
  senses.forEach(raw => {
    const sense = item!.senses.find(s => s.id === raw.id || normalizeAnswer(s.definition) === normalizeAnswer(raw.definition));
    if (!sense) return;
    if (raw.distinctionTask && english(raw.distinctionTask.prompt) && english(raw.distinctionTask.answer)) sense.distinctionTask = { prompt: english(raw.distinctionTask.prompt), answer: english(raw.distinctionTask.answer), options: englishList(raw.distinctionTask.options), explanation: english(raw.distinctionTask.explanation) };
    if (raw.wordFamily) sense.wordFamily = englishList(raw.wordFamily);
    if (raw.register) sense.register = english(raw.register);
  });
  if (input.pronunciation && !Array.isArray(input.pronunciation)) item.pronunciation = { ipa: english(input.pronunciation.ipa), uk: english(input.pronunciation.uk), us: english(input.pronunciation.us) };
  return { item, duplicate, invalid: false };
}

export function updateVocabularyItem(state: VocabularyStore, entryId: string, input: Partial<VocabularyEntry> & { skill?: VocabularySource['skill']; source?: string }) {
  const item = state.vocabulary.find(entry => entry.id === entryId); if (!item) return null;
  const term = input.term === undefined ? item.term : english(input.term);
  if (!term || state.vocabulary.some(entry => entry.id !== entryId && vocabularyKey(entry.term) === vocabularyKey(term))) return null;
  if ((input.meaning !== undefined && !english(input.meaning) && input.meaning.trim()) || (input.example !== undefined && !english(input.example) && input.example.trim())) return null;
  item.term = term;
  const first = item.senses[0];
  if (input.meaning !== undefined && first) first.definition = english(input.meaning);
  if (input.example !== undefined && first) first.example = english(input.example);
  item.meaning = first?.definition || ''; item.example = first?.example || '';
  if (input.tags !== undefined) item.tags = englishList(input.tags);
  if (input.category) item.category = input.category;
  if (input.senses) input.senses.forEach((raw, index) => {
    const sense = item.senses.find(s => s.id === raw.id) || item.senses[index];
    if (!sense) return;
    Object.assign(sense, { definition: english(raw.definition), example: english(raw.example), pos: english(raw.pos) || 'expression', collocations: englishList(raw.collocations), usage: english(raw.usage), synonyms: englishList(raw.synonyms), antonyms: englishList(raw.antonyms), distinctions: englishList(raw.distinctions) });
  });
  item.meaning = item.senses[0]?.definition || ''; item.example = item.senses[0]?.example || '';
  item.enrichmentPending = item.senses.every(s => !s.definition);
  item.updatedAt = nowIso(); return item;
}

export function removeVocabularyItem(state: VocabularyStore, entryId: string) {
  const entry = state.vocabulary.find(item => item.id === entryId); if (!entry) return false;
  // Archive the item; evidence remains available to backups and source history.
  entry.tags = [...new Set(entry.tags.concat('archived'))]; entry.updatedAt = nowIso(); return true;
}

export function setVocabularyManualStatus(state: VocabularyStore, entryId: string, status: VocabularyStatus, senseId?: string) {
  const entry = state.vocabulary.find(item => item.id === entryId); if (!entry || !VOCABULARY_STATUSES.includes(status)) return null;
  const learning = ensureLearning(state, entry, senseId); learning.manualStatus = status; learning.updatedAt = nowIso(); return learning;
}

export function deriveVocabularyStatus(state: VocabularyState): VocabularyStatus {
  const dimensions = VOCABULARY_DIMENSIONS.map(key => state.dimensions[key]);
  const spaced = (record: { firstSuccessAt?: string; lastSuccessAt?: string }) => Boolean(record.firstSuccessAt && record.lastSuccessAt && Date.parse(record.lastSuccessAt) - Date.parse(record.firstSuccessAt) >= 86400000);
  if (state.wrong.active) return 'unstable';
  if (dimensions.every(d => d.successes >= 5 && spaced(d)) && (state.verifiedProduction?.successes || 0) >= 2 && spaced(state.verifiedProduction!)) return 'mastered';
  if (dimensions.every(d => d.successes >= 3 && spaced(d))) return 'familiar';
  if (state.dimensions.usage.successes >= 2) return 'active';
  if (dimensions.some(d => d.successes > 0)) return 'unstable';
  if (dimensions.some(d => d.failures > 0)) return 'unfamiliar';
  return 'new';
}

function refreshWrong(learning: VocabularyState) {
  const all = Object.values(learning.wrong.modes);
  learning.wrong.active = all.some(item => item?.active);
  const active = all.filter(item => item?.active);
  learning.wrong.successesSinceFailure = active.length ? Math.min(...active.map(item => item!.successesSinceFailure)) : 0;
  learning.wrong.lastFailureAt = all.map(item => item?.lastFailureAt || '').sort().pop() || undefined;
}
function applyWrongEvidence(learning: VocabularyState, mode: VocabularyMode, result: VocabularyResult, at: string) {
  const wrong = learning.wrong.modes[mode] || { active: false, successesSinceFailure: 0 };
  learning.wrong.modes[mode] = wrong;
  if (result === 'failure') { Object.assign(wrong, { active: true, successesSinceFailure: 0, firstRecoveryAt: undefined, resolvedAt: undefined, lastFailureAt: at }); }
  else if (wrong.active && result === 'success') {
    wrong.successesSinceFailure += 1;
    if (!wrong.firstRecoveryAt) wrong.firstRecoveryAt = at;
    if (wrong.successesSinceFailure >= 3 && new Date(at).getTime() - new Date(wrong.firstRecoveryAt).getTime() >= 86400000) { wrong.active = false; wrong.resolvedAt = at; }
  }
  refreshWrong(learning);
}

export function recordVocabularyEvidence(state: Partial<VocabularyStore>, input: VocabularyEvidence) {
  ensureStore(state);
  if (!VOCABULARY_MODES.includes(input.mode) || !VOCABULARY_DIMENSIONS.includes(input.dimension) || !['success', 'partial', 'failure', 'pending'].includes(input.result)) throw new Error('Invalid vocabulary evidence.');
  const entry = state.vocabulary.find(item => item.id === input.entryId); if (!entry) throw new Error('Vocabulary entry not found.');
  if (Number.isNaN(new Date(input.occurredAt).getTime())) throw new Error('Evidence needs a valid date.');
  if (input.senseId && !entry.senses.some(sense => sense.id === input.senseId)) throw new Error('Vocabulary sense not found.');
  const learning = ensureLearning(state, entry, input.senseId);
  if (input.id && state.vocabularyEvidence.some(item => item.id === input.id)) return learning;
  const event: VocabularyEvidence = { ...input, id: input.id || makeId('evidence'), senseId: learning.senseId, occurredAt: new Date(input.occurredAt).toISOString(), response: english(input.response), context: english(input.context) };
  state.vocabularyEvidence.push(event);
  if (event.result !== 'pending') {
    const dim = learning.dimensions[input.dimension];
    if (event.result === 'success') { dim.successes += 1; dim.firstSuccessAt = dim.firstSuccessAt || event.occurredAt; dim.lastSuccessAt = event.occurredAt; }
    if (event.result === 'failure') dim.failures += 1;
    if (event.result === 'partial') dim.partials += 1;
    if (input.scheduling !== false) applyWrongEvidence(learning, input.mode, input.result, event.occurredAt);
  }
  const source: VocabularySource = { type: input.sourceType, id: input.sourceId, skill: input.skill, bookId: input.bookId, unitId: input.unitId, senseId: learning.senseId, context: english(input.context) };
  if (!entry.sources.some(s => s.type === source.type && s.id === source.id && s.senseId === source.senseId)) entry.sources.push(source);
  learning.updatedAt = event.occurredAt; return learning;
}

export function recordVocabularyReview(state: VocabularyStore, input: { entryId: string; senseId?: string; mode: VocabularyMode; result: VocabularyResult; response?: string; occurredAt?: string; durationMs?: number; skill?: VocabularySource['skill']; sourceType?: VocabularySource['type']; sourceId?: string; bookId?: string; unitId?: string; verification?: VocabularyEvidence['verification']; id?: string }) {
  ensureStore(state);
  if (!VOCABULARY_MODES.includes(input.mode)) throw new Error('Unknown review mode.');
  const entry = state.vocabulary.find(item => item.id === input.entryId); if (!entry) throw new Error('Vocabulary entry not found.');
  const learning = ensureLearning(state, entry, input.senseId);
  const at = validTime(input.occurredAt); const id = input.id || makeId('review');
  if (state.vocabularyReviews.some(item => item.id === id)) return learning;
  const dimensions = modeDimensions[input.mode];
  dimensions.forEach(dimension => recordVocabularyEvidence(state, {
    ...input, id: `${id}:${dimension}`, senseId: learning.senseId, sourceType: input.sourceType || 'personal', sourceId: input.sourceId || id,
    dimension, occurredAt: at, scheduling: false, verification: input.verification || (input.mode === 'production' ? 'pending' : 'objective'),
  }));
  const result = input.result;
  if (result !== 'pending') {
    const card = learning.cards[input.mode] || createEmptyCard(new Date(at))!;
    const grade = result === 'failure' ? Rating.Again : result === 'partial' ? Rating.Hard : Rating.Good;
    const next = scheduler.next(card, new Date(at), grade).card;
    learning.cards[input.mode] = JSON.parse(JSON.stringify(next));
    dimensions.forEach(dimension => { learning.dimensions[dimension].nextReviewAt = next.due.toISOString(); });
    applyWrongEvidence(learning, input.mode, result, at);
    learning.reviewCount += 1; learning.lastReviewedAt = at;
    learning.nextReviewAt = Object.values(learning.cards).map(card => String(card?.due || '')).filter(Boolean).sort()[0];
    if (input.mode === 'production' && input.verification === 'assessed' && result === 'success') {
      const production = learning.verifiedProduction || { successes: 0 };
      production.successes += 1; production.firstSuccessAt = production.firstSuccessAt || at; production.lastSuccessAt = at; learning.verifiedProduction = production;
    }
  }
  const response = english(input.response);
  const expected = normalizeAnswer(entry.term); const actual = normalizeAnswer(response);
  const errorType = input.mode === 'dictation' && result === 'failure' ? actual.length < expected.length ? 'missing letters' : actual.length > expected.length ? 'extra letters' : 'wrong letters or word form' : undefined;
  state.vocabularyReviews.push({ id, entryId: entry.id, senseId: learning.senseId, mode: input.mode, result, response, occurredAt: at, durationMs: input.durationMs, errorType, verification: input.verification, bookId: input.bookId, unitId: input.unitId, updatedAt: at });
  if (input.bookId && input.unitId && response.trim()) {
    let progress = state.wordbookProgress.find(p => p.bookId === input.bookId && p.unitId === input.unitId);
    if (!progress) { progress = { id: `wp-${hashText(`${input.bookId}:${input.unitId}`)}`, bookId: input.bookId, unitId: input.unitId, completedEntryIds: [], status: 'in_progress', updatedAt: at }; state.wordbookProgress.push(progress); }
    progress.completedEntryIds = [...new Set(progress.completedEntryIds.concat(entry.id))]; progress.updatedAt = at;
  }
  learning.updatedAt = at; return learning;
}

function supportsMode(entry: VocabularyEntry, sense: VocabularySense, mode: VocabularyMode) {
  if (mode === 'definition') return Boolean(sense.definition);
  if (mode === 'cloze' || mode === 'synonym') return Boolean(learningTask(entry, sense, mode));
  if (mode === 'distinction') return Boolean(learningTask(entry, sense, mode) || (sense.source === 'Personal note' && sense.synonyms?.length && sense.distinctions?.length));
  return true;
}
export function getVocabularyReviewQueue(state: Partial<VocabularyStore>, filter: ReviewQueueFilter = {}): ReviewCard[] {
  const at = new Date(filter.now || new Date()).getTime(); const cards: ReviewCard[] = [];
  const learningBySense = new Map((state.vocabularyStates || []).map(learning => [`${learning.entryId}:${learning.senseId}`, learning]));
  (state.vocabulary || []).filter(entry => !entry.tags.includes('archived') && (!filter.entryId || entry.id === filter.entryId)).forEach(raw => {
    const resolved = resolveVocabularyLearningContext(raw, filter);
    const entry = resolved.entry;
    const selectedOnly = Boolean(filter.senseId || filter.bookId && filter.unitId);
    const senses = selectedOnly ? (resolved.sense ? [resolved.sense] : []) : entry.senses;
    senses.forEach(sense => {
    if (filter.senseId && sense.id !== filter.senseId) return;
    const sources = entry.sources.filter(s => (!s.senseId || s.senseId === sense.id) && (!filter.bookId || s.bookId === filter.bookId) && (!filter.unitId || s.unitId === filter.unitId) && (!filter.skill || s.skill === filter.skill) && (!filter.sourceType || s.type === filter.sourceType));
    if ((filter.bookId || filter.unitId || filter.skill || filter.sourceType) && !sources.length) return;
    const learning = learningBySense.get(`${entry.id}:${sense.id}`);
    const modes = filter.mode ? [filter.mode] : VOCABULARY_MODES;
    modes.forEach(mode => {
      if (!supportsMode(entry, sense, mode) || (filter.dimension && !modeDimensions[mode].includes(filter.dimension))) return;
      const dueAt = validTime(learning?.cards[mode]?.due || learning?.legacyProgress?.nextReviewAt || entry.createdAt);
      if (filter.dueOnly !== false && new Date(dueAt).getTime() > at) return;
      const cardContext = sense.id === resolved.sense?.id ? resolved.context : resolveVocabularyLearningContext(raw, { ...filter, senseId: sense.id }).context;
      cards.push({ id: `${entry.id}:${sense.id}:${mode}`, entryId: entry.id, senseId: sense.id, entry, mode, dimension: modeDimensions[mode][0], dueAt, sources, task: learningTask(entry, sense, mode), contentVersion: resolved.contentVersion, context: cardContext });
    });
    });
  });
  return cards.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}
export function dueVocabulary(state: VocabularyStore, now?: string | Date, skill?: VocabularySource['skill']) {
  const ids = new Set(getVocabularyReviewQueue(state, { now, skill }).map(card => card.entryId));
  return state.vocabulary.filter(entry => ids.has(entry.id));
}
export function getActiveWrongWords(state: VocabularyStore, filter: ReviewQueueFilter = {}) {
  return state.vocabularyStates.filter(learning => learning.wrong.active).flatMap(learning => {
    const entry = state.vocabulary.find(e => e.id === learning.entryId); if (!entry || entry.tags.includes('archived')) return [];
    if (filter.dimension && !Object.entries(learning.wrong.modes).some(([mode, wrong]) => wrong?.active && modeDimensions[mode as VocabularyMode].includes(filter.dimension!))) return [];
    if ((filter.bookId || filter.unitId || filter.skill || filter.sourceType) && !entry.sources.some(s => (!s.senseId || s.senseId === learning.senseId) && (!filter.bookId || s.bookId === filter.bookId) && (!filter.unitId || s.unitId === filter.unitId) && (!filter.skill || s.skill === filter.skill) && (!filter.sourceType || s.type === filter.sourceType))) return [];
    return [{ ...learning, entry, learningState: learning }];
  }).sort((a, b) => (b.wrong.lastFailureAt || '').localeCompare(a.wrong.lastFailureAt || ''));
}
export function resolveWrongWord(state: VocabularyStore, entryId: string, reason: string, senseId?: string) {
  const entry = state.vocabulary.find(e => e.id === entryId); if (!entry) return null;
  const learning = ensureLearning(state, entry, senseId); const at = nowIso();
  Object.values(learning.wrong.modes).forEach(wrong => { if (wrong) { wrong.active = false; wrong.resolvedAt = at; } });
  Object.assign(learning.wrong, { active: false, resolvedAt: at, reason: english(reason) || 'Manually resolved' }); learning.updatedAt = at; return learning;
}
export function recordAudioActivity(state: VocabularyStore, entryId: string, occurredAt?: string) {
  if (!state.vocabulary.some(e => e.id === entryId)) return null;
  const at = validTime(occurredAt); const item = { id: makeId('audio-activity'), entryId, mode: 'audio' as const, occurredAt: at, updatedAt: at }; state.vocabularyActivities.push(item); return item;
}
export function enrollWordbook(state: VocabularyStore, bookId: string) {
  ensureStore(state);
  const book = VOCABULARY_CATALOG.books.find(b => b.id === bookId); if (!book) return null;
  if (!state.wordbookEnrollments.some(row => row.bookId === bookId)) state.wordbookEnrollments.push({ id: `enroll-${bookId}`, bookId, updatedAt: nowIso() });
  VOCABULARY_CATALOG.memberships.filter(m => m.bookId === bookId).forEach(membership => {
    const entry = VOCABULARY_CATALOG.entries.find(e => e.id === membership.entryId); if (!entry) return;
    addVocabularyItem(state, { ...(entry as unknown as VocabularyEntry), sources: [{ type: 'wordbook', id: `${bookId}:${membership.unitId}:${entry.id}`, bookId, unitId: membership.unitId, skill: book.skill as VocabularySource['skill'] }] });
  });
  return book;
}
export function markWordbookUnitComplete(state: VocabularyStore, bookId: string, unitId: string) {
  const unit = VOCABULARY_CATALOG.units.find(u => u.id === unitId && u.bookId === bookId);
  if (!unit) return null;
  const entryIds: string[] = [...new Set([
    ...(unit.entryIds || []),
    ...VOCABULARY_CATALOG.memberships.filter(m => m.bookId === bookId && m.unitId === unitId).map(m => m.entryId),
    ...state.vocabulary.filter(e => e.sources.some(s => s.bookId === bookId && s.unitId === unitId)).map(e => e.id),
  ])];
  const progress = state.wordbookProgress.find(p => p.bookId === bookId && p.unitId === unitId);
  if (!entryIds.length || !progress || entryIds.some(id => !progress.completedEntryIds.includes(id))) return null;
  progress.status = 'completed'; progress.updatedAt = nowIso(); return progress;
}

export function normalizeVocabularyCollections(source: Partial<VocabularyStore>): VocabularyStore {
  const data = {} as VocabularyStore;
  vocabularyLists.forEach(key => Object.assign(data, { [key]: Array.isArray(source[key]) ? structuredClone(source[key]) : [] }));
  const raw = data.vocabulary; data.vocabulary = []; const states = data.vocabularyStates; data.vocabularyStates = [];
  const ids=new Set();const terms=new Set();
  const canonical=raw.every(entry=>{
    const key=vocabularyKey(entry.term);
    if(!entry.id||!english(entry.term)||ids.has(entry.id)||terms.has(key)||!entry.senses?.length||new Set(entry.senses.map(s=>s.id)).size!==entry.senses.length)return false;
    ids.add(entry.id);terms.add(key);return true;
  });
  if(canonical){
    data.vocabulary=raw.map(entry=>({...entry,term:english(entry.term),tags:englishList(entry.tags),sources:(entry.sources||[]).map(source=>({...source,context:english(source.context)})),senses:entry.senses.map(sense=>({...sense,definition:english(sense.definition),example:english(sense.example),pos:english(sense.pos)||'expression',collocations:englishList(sense.collocations),usage:english(sense.usage),synonyms:englishList(sense.synonyms),antonyms:englishList(sense.antonyms),distinctions:englishList(sense.distinctions),wordFamily:englishList(sense.wordFamily),register:english(sense.register),source:english(sense.source),license:english(sense.license)})),meaning:english(entry.senses[0].definition),example:english(entry.senses[0].example)}));
    const prior=new Map(states.map(learning=>[`${learning.entryId}:${learning.senseId}`,learning]));
    data.vocabulary.forEach(entry=>entry.senses.forEach(sense=>{
      const existing=prior.get(`${entry.id}:${sense.id}`);
      data.vocabularyStates.push({id:existing?.id||`vs-${hashText(`${entry.id}:${sense.id}`)}`,entryId:entry.id,senseId:sense.id,manualStatus:existing?.manualStatus||'new',dimensions:Object.fromEntries(VOCABULARY_DIMENSIONS.map(d=>[d,{...freshDimension(),...existing?.dimensions?.[d]}])) as VocabularyState['dimensions'],cards:existing?.cards||{},wrong:Object.assign({active:false,successesSinceFailure:0,modes:{}},existing?.wrong),reviewCount:existing?.reviewCount||0,updatedAt:existing?.updatedAt||entry.updatedAt||nowIso(),...existing});
    }));
    data.vocabularyEvidence=data.vocabularyEvidence.map(event=>({...event,response:english(event.response),context:english(event.context)}));
    data.vocabularyReviews=data.vocabularyReviews.map(review=>({...review,response:english(review.response)}));
    return data;
  }
  raw.forEach(entry => {
    const result = addVocabularyItem(data, entry);
    if (!result.item) return;
    result.item.createdAt = entry.createdAt || result.item.createdAt;
    result.item.updatedAt = entry.updatedAt || result.item.updatedAt;
    entry.senses?.forEach(sense => {
      const existing = states.find(s => s.entryId === entry.id && s.senseId === sense.id); if (!existing) return;
      const current = ensureLearning(data, result.item!, sense.id);
      Object.assign(current, existing, { entryId: result.item!.id });
      current.dimensions = Object.fromEntries(VOCABULARY_DIMENSIONS.map(dimension => [dimension, { ...freshDimension(), ...existing.dimensions?.[dimension] }])) as VocabularyState['dimensions'];
      current.cards = existing.cards || {}; current.wrong = Object.assign({ active: false, successesSinceFailure: 0, modes: {} }, existing.wrong);
    });
  });
  data.vocabularyEvidence = data.vocabularyEvidence.map(event => ({ ...event, response: english(event.response), context: english(event.context) }));
  data.vocabularyReviews = data.vocabularyReviews.map(review => ({ ...review, response: english(review.response) }));
  return data;
}
export function migrateLegacyVocabulary(source: Partial<VocabularyStore> & { lexicon?: Record<string, unknown>[] }): VocabularyStore {
  const data = normalizeVocabularyCollections(source);
  (source.lexicon || []).forEach(old => {
    const result = addVocabularyItem(data, { term: english(old.term), category: old.category as VocabularyEntry['category'], meaning: english(old.meaning), example: english(old.example), tags: englishList(old.tags), skill: old.skill === 'speaking' ? 'speaking' : 'writing', source: english(old.source) || 'Legacy collection' });
    if (!result.item) return;
    const learning = ensureLearning(data, result.item);
    if (learning.legacyProgress) return;
    learning.reviewCount = Math.max(learning.reviewCount, Number(old.reviewCount || 0));
    learning.manualStatus = old.status === 'mastered' ? 'familiar' : old.status === 'learning' ? 'unstable' : 'new';
    learning.nextReviewAt = old.nextReviewAt ? validTime(old.nextReviewAt) : undefined;
    learning.lastReviewedAt = old.lastReviewedAt ? validTime(old.lastReviewedAt) : undefined;
    learning.legacyProgress = { reviewCount: Number(old.reviewCount || 0), status: english(old.status), nextReviewAt: learning.nextReviewAt, lastReviewedAt: learning.lastReviewedAt };
  });
  return data;
}

export function termOccurs(text: string, term: string) {
  const escaped = normalizeAnswer(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, 'i').test(normalizeAnswer(text));
}
export function collectVocabularyProduction(state: VocabularyStore, attempt: { id: string; skill?: VocabularySource['skill']; essay: string; date: string; vocabularyTargets?: unknown[] }) {
  ensureStore(state);
  const matches = state.vocabulary.filter(entry => !entry.tags.includes('archived') && termOccurs(attempt.essay, entry.term));
  const targets = matches.map(entry => ({ entryId: entry.id, senseId: entry.senses[0].id, term: entry.term, definition: entry.senses[0].definition }));
  attempt.vocabularyTargets = targets;
  targets.forEach(target => recordVocabularyEvidence(state, { id: `production:${attempt.id}:${target.entryId}`, entryId: target.entryId, senseId: target.senseId, skill: attempt.skill || 'writing', sourceType: attempt.skill || 'writing', sourceId: attempt.id, dimension: 'usage', mode: 'production', result: 'pending', response: attempt.essay, occurredAt: attempt.date, verification: 'pending' }));
  return targets;
}
export function syncProductionVocabularyEvidence(state: VocabularyStore, assessment: { id: string; date: string; vocabularyEvidenceRows?: { term: string; result: string; evidence: string }[] }, attempt: { id: string; essay: string; skill?: VocabularySource['skill']; vocabularyTargets?: { entryId: string; senseId: string; term: string }[] }) {
  (assessment.vocabularyEvidenceRows || []).forEach(row => {
    const target = attempt.vocabularyTargets?.find(target => normalizeAnswer(target.term) === normalizeAnswer(row.term));
    const quote = row.evidence.trim();
    if (!target || !quote || !attempt.essay.includes(quote) || !termOccurs(quote, target.term) || !['success', 'partial', 'failure'].includes(row.result)) return;
    recordVocabularyReview(state, { id: `assessed:${assessment.id}:${target.entryId}`, entryId: target.entryId, senseId: target.senseId, skill: attempt.skill || 'writing', mode: 'production', result: row.result as VocabularyResult, response: quote, sourceType: 'assessment', sourceId: assessment.id, occurredAt: assessment.date, verification: 'assessed' });
  });
}

export function parseVocabularySuggestions(text: string) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(cells => cells.length >= 5 && cells[0] && !/^[-:]+$/.test(cells[0]) && !/^(type|category|\u7c7b\u578b)$/i.test(cells[0])).map(cells => ({ category: ['word', 'phrase', 'sentence'].includes(cells[0].toLowerCase()) ? cells[0].toLowerCase() : 'phrase', term: english(cells[1]), meaning: english(cells[2]), example: english(cells[3]), tags: englishList(cells[4]) })).filter(item => item.term);
}
