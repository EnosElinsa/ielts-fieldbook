import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext, VOCABULARY_CONTEXT_VERSION } from '../../src/domain/vocabulary/context';
import { getVocabularyReviewQueue, normalizeVocabularyCollections } from '../../src/domain/vocabulary';
import { learningTask } from '../../src/domain/vocabulary/content';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { createVocabularySession, buildVocabularySessionCommit } from '../../src/domain/vocabulary/session';
import { writeVocabularyDraft, readVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { VocabularyEntry, VocabularyStore } from '../../src/domain/vocabulary/types';

const original = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = (term: string) => structuredClone(released.entries.find((e: VocabularyEntry) => e.term === term)) as VocabularyEntry;
const fresh = (entries: VocabularyEntry[] = []): VocabularyStore => ({ vocabulary: entries, vocabularyStates: [], vocabularyReviews: [], vocabularyEvidence: [], vocabularyActivities: [], vocabularyImportBatches: [], wordbookProgress: [], wordbookEnrollments: [] });
const resolve = (term: string, unitId: string) => resolveVocabularyLearningContext(entry(term), { bookId: 'ielts-vocabulary', unitId });
beforeEach(() => { Object.assign(VOCABULARY_CATALOG, structuredClone(released)); localStorage.clear(); });
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(original)));

test('core binds distinct geography and fruit senses without changing notes or IDs', () => {
  const raw = entry('core'); const before = structuredClone(raw);
  const geo = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  const food = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02' });
  expect(geo.sense?.id).toBe(raw.senses[0].id);
  expect(geo.sense?.definition).toContain('Earth');
  expect(food.sense?.id).toBe('editorial:core:fruit-centre');
  expect(food.sense?.definition).toContain('seeds');
  expect(food.entry.senses[0]).toEqual(food.sense);
  expect(food.context).toMatchObject({ entryId: raw.id, senseId: food.sense!.id, status: 'reviewed', version: VOCABULARY_CONTEXT_VERSION });
  expect(food.entry.senses).toContainEqual(raw.senses[0]);
  expect(raw).toEqual(before);
  food.sense!.definition = 'Caller modification';
  expect(resolve('core', 'ielts-vocabulary-chapter-12-group-02').sense?.definition).toContain('fruit');
  expect(geo.sense?.synonyms).toEqual([]);
});

test.each([
  ['vegetable', 'ielts-vocabulary-chapter-12-group-02', /eaten as food/], ['fruit', 'ielts-vocabulary-chapter-12-group-02', /edible/],
  ['fruit', 'ielts-vocabulary-chapter-02-group-01', /flower.*seeds/], ['strip', 'ielts-vocabulary-chapter-12-group-02', /piece of material/],
  ['peel', 'ielts-vocabulary-chapter-12-group-02', /skin or outer layer/], ['peel', 'ielts-vocabulary-chapter-20-group-02', /remove the skin/],
  ['order', 'ielts-vocabulary-chapter-12-group-01', /request for food/], ['order', 'ielts-vocabulary-chapter-18-group-03', /command/],
  ['recipe', 'ielts-vocabulary-chapter-12-group-01', /preparing a dish/],
])('resolves %s in %s to complete contextual content', (term, unit, expected) => {
  const result = resolve(term, unit);
  expect(result.sense?.definition).toMatch(expected);
  expect(result.sense?.example).toMatch(/[.!?]$/);
  expect(result.sense?.collocations?.length).toBeGreaterThan(1);
  expect(result.reviewed).toBe(true);
});

test('the food curriculum recommends a treat as food without relabelling the previous medical-care sense', () => {
  const result=resolve('treat','ielts-vocabulary-chapter-12-group-01');
  expect(result.sense?.definition).toMatch(/food/);
  expect(result.sense?.pos).toBe('noun');
  expect(result.reviewed).toBe(false);
  expect(result.entry.senses.some(s=>/medical care/.test(s.definition))).toBe(true);
});

test('common food defaults improve standalone detail and generic group intent remains explicit', () => {
  expect(resolveVocabularyLearningContext(entry('fruit')).sense?.definition).toContain('edible');
  expect(resolveVocabularyLearningContext(entry('vegetable')).sense?.definition).toContain('eaten as food');
  expect(resolveVocabularyLearningContext(entry('fruit'), { bookId: 'unknown', unitId: 'unknown' })).toMatchObject({ status: 'unreviewed', sense: { definition: expect.stringContaining('edible') } });
  const cashier = resolveVocabularyLearningContext(entry('cashier'), { bookId: 'ielts-listening-vocabulary', unitId: 'ielts-listening-vocabulary-chapter-01-group-02' });
  expect(cashier.sense?.definition).toContain('receives payments');
  expect(cashier).toMatchObject({ reviewed: false, contentReviewed: true, status: 'unresolved' });
});

test('same-ID learner edits and personal notes survive a public content supplement', () => {
  const raw = entry('core'); raw.senses[0].definition = 'My course note about the core.'; raw.senses[0].example = 'Keep this example.';
  const resolved = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  expect(resolved.sense).toEqual(raw.senses[0]); expect(resolved.reviewed).toBe(false);
  const peel = entry('peel'); peel.senses[0].source = 'Personal note';
  expect(resolveVocabularyLearningContext(peel, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-20-group-02' }).sense).toEqual(peel.senses[0]);
});

test('committed editorial provenance cannot authorize a canned task after learner editing', () => {
  const state = fresh([entry('stable')]);
  const cards = getVocabularyReviewQueue(state, { mode: 'synonym', dueOnly: false });
  const session = createVocabularySession(cards, 'synonym', {});
  const committed = buildVocabularySessionCommit(state, session, cards).state;
  const saved = committed.vocabulary[0];
  const selected = saved.senses.find(sense => sense.id === cards[0].senseId)!;
  expect(selected.editorial).toBeTruthy();
  selected.definition = 'My note about a stable arrangement.';
  selected.example = 'A stable arrangement helps our team.';
  const result = resolveVocabularyLearningContext(saved);
  expect(result.reviewed).toBe(false);
  expect(result.sense?.definition).toBe(selected.definition);
  expect(learningTask(result.entry, result.sense!, 'definition')).toBeUndefined();
  expect(learningTask(result.entry, result.sense!, 'synonym')).toBeUndefined();
  expect(learningTask(result.entry, result.sense!, 'cloze')?.prompt).toBe('A _____ arrangement helps our team.');
});

test.each([
  ['pos', 'expression'], ['usage', 'My usage note.'], ['collocations', ['my chosen core phrase']],
  ['synonyms', ['my core synonym']], ['antonyms', ['my core antonym']],
  ['distinctions', ['My distinction note.']], ['wordFamily', ['my word family']], ['register', 'My register note.'],
] as const)('preserves learner edits to %s even when definition and example are unchanged', (field, value) => {
  const raw = entry('core'); const reviewed = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  raw.senses = [structuredClone(reviewed.sense!)];
  Object.assign(raw.senses[0], { [field]: value });
  const result = resolveVocabularyLearningContext(raw, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  expect(result.sense?.[field]).toEqual(value);
  expect(result).toMatchObject({ reviewed: false, contentReviewed: false });
});

test.each([
  ['courtship', /attracts a mate/], ['Mandarin', /standard form of Chinese/], ['bull', /adult male bovine/],
  ['cock', /male chicken/], ['appliance', /electrical device/], ['temple', /religious worship/],
  ['rock', /hard natural material/], ['paste', /mixture/], ['democracy', /voting/],
  ['warn', /possible danger/], ['commitment', /promise/], ['heaven', /sky/],
])('repairs concrete known archaic or fragmented content for %s without discarding original senses', (term, definition) => {
  const raw = entry(term); const resolved = resolveVocabularyLearningContext(raw);
  expect(resolved.sense?.definition).toMatch(definition);
  expect(resolved.sense?.definition).not.toMatch(/(?:especially|specifically|such as|in particular)\s*:?$/i);
  expect(resolved.sense?.example).toMatch(/[.!?]$/);
  expect(raw.senses.every(sense => resolved.entry.senses.some(item => item.id === sense.id))).toBe(true);
});

test('known fragment review keeps explicit dictionary IDs and honest uncertain group status', () => {
  expect(resolve('rock', 'ielts-vocabulary-chapter-09-group-02').sense?.id).toBe('kaikki:2f15f9e0d26b9cc74f');
  expect(resolve('courtship', 'ielts-vocabulary-chapter-03-group-01').sense?.id).toBe('editorial:courtship:animal-mating');
  expect(resolveVocabularyLearningContext(entry('Mandarin'), { bookId: 'ielts-listening-essentials', unitId: 'ielts-listening-essentials-chapter-02-group-13' })).toMatchObject({ status: 'unresolved', contentReviewed: true });
  expect(resolveVocabularyLearningContext(entry('heaven')).sense?.usage).toContain('dated');
  expect(resolveVocabularyLearningContext(entry('gizmo')).sense?.definition).toBe(entry('gizmo').senses[0].definition);
});

test('explicit sense route overrides group binding and missing explicit identity does not fall back', () => {
  const geo = resolve('core', 'ielts-vocabulary-chapter-01-group-01');
  expect(resolveVocabularyLearningContext(entry('core'), { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02', senseId: geo.sense!.id }).sense?.id).toBe(geo.sense!.id);
  expect(getVocabularyReviewQueue(fresh([entry('core')]), { senseId: 'missing', entryId: entry('core').id, dueOnly: false })).toEqual([]);
});

test('group mode coverage cannot silently choose another sense or attach unrelated synonym task', () => {
  expect(buildUnitPracticeQueue(fresh(), 'ielts-vocabulary', 'ielts-vocabulary-chapter-12-group-01', 'synonym').cards.some(card => card.entry.term === 'order')).toBe(false);
  const sequence = getVocabularyReviewQueue(fresh([entry('order')]), { mode: 'synonym', dueOnly: false });
  // The later full dictionary review teaches a new exact context; its empty
  // synonym list must not reactivate the older common-context substitution.
  expect(sequence).toEqual([]);
  const food = buildUnitPracticeQueue(fresh(), 'ielts-vocabulary', 'ielts-vocabulary-chapter-12-group-01', 'definition').cards.find(card => card.entry.term === 'order')!;
  expect(food.task).toBeUndefined(); expect(food.entry.senses[0].definition).toContain('request');
  const noun = entry('fundamental');
  expect(learningTask(noun, noun.senses[0], 'synonym')).toBeUndefined();
  const adjective = resolveVocabularyLearningContext(noun, { bookId: 'ielts-reading-keywords', unitId: 'ielts-reading-keywords-chapter-01-group-01' });
  expect(learningTask(adjective.entry, adjective.sense!, 'synonym')?.acceptedAnswers).toContain('basic');
  expect(resolveVocabularyLearningContext(entry('stable')).sense?.definition).toContain('Not changing');
  expect(resolveVocabularyLearningContext(entry('construct')).sense?.pos).toBe('verb');
});

test('queues and resolver do not create learning state or rewrite historical records', () => {
  const state = { vocabulary: [entry('peel')] }; const before = structuredClone(state);
  getVocabularyReviewQueue(state, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02', dueOnly: false });
  buildUnitPracticeQueue(state, 'ielts-vocabulary', 'ielts-vocabulary-chapter-12-group-02', 'definition');
  expect(state).toEqual(before); expect(Object.keys(state)).toEqual(['vocabulary']);
});

test('new editorial sense freezes context, grades after live changes, and commits only on submission', () => {
  const state = fresh(); const cards = buildUnitPracticeQueue(state, 'ielts-vocabulary', 'ielts-vocabulary-chapter-12-group-02', 'definition').cards.filter(card => card.entry.term === 'core');
  const session = createVocabularySession(cards, 'definition', {}, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02' }, { kind: 'unit', bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02' });
  expect(writeVocabularyDraft('test-owner', session)).toBe(true);
  const restored = readVocabularyDraft('test-owner')!;
  restored.answers[cards[0].id] = { response: 'core', answeredAt: '2026-10-10', durationMs: 0 };
  cards[0].entry.senses[0].definition = 'Changed after creating the question';
  const committed = buildVocabularySessionCommit(state, restored, cards);
  expect(committed.results[0]).toMatchObject({ result: 'success', definition: 'The central part of a fruit containing its seeds.', context: restored.cardSnapshots![0].context });
  expect(committed.state.vocabularyStates[0].senseId).toBe('editorial:core:fruit-centre');
  expect(resolveVocabularyLearningContext(committed.state.vocabulary[0], { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02' }).reviewed).toBe(true);
  expect(state.vocabulary).toEqual([]);
});

test('draft and submission reject mismatched or malformed context while old drafts retain scoring', () => {
  const state = fresh([entry('recipe')]); const cards = getVocabularyReviewQueue(state, { mode: 'distinction', dueOnly: false });
  const session = createVocabularySession(cards, 'distinction', {});
  const malformed = structuredClone(session); malformed.cardSnapshots![0].context!.entryId = 'different';
  expect(writeVocabularyDraft('invalid', malformed)).toBe(false);
  expect(() => buildVocabularySessionCommit(state, malformed, cards)).toThrow('context');
  const wrongGroup = structuredClone(session); wrongGroup.selection = { kind: 'unit', bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-01' };
  expect(writeVocabularyDraft('invalid', wrongGroup)).toBe(false);
  const wrongFilter = structuredClone(session); wrongFilter.filter = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-01' };
  expect(writeVocabularyDraft('invalid', wrongFilter)).toBe(false);
  delete session.cardSnapshots![0].context;
  session.answers[cards[0].id] = { response: 'recipe', answeredAt: '2026-10-10', durationMs: 0 };
  expect(writeVocabularyDraft('legacy-snapshot', session)).toBe(true);
  expect(buildVocabularySessionCommit(state, session, cards).results[0].result).toBe('success');
  delete session.cardSnapshots; delete session.contentVersion;
  expect(writeVocabularyDraft('legacy-identities', session)).toBe(true);
  expect(buildVocabularySessionCommit(state, session, cards).results[0].result).toBe('success');
});

test('a normalized saved source snapshot of paste still receives reviewed teaching content', () => {
  const raw = entry('paste');
  delete raw.senses[0].wordFamily; delete raw.senses[0].register;
  const saved = normalizeVocabularyCollections(fresh([raw])).vocabulary[0];
  const result = resolveVocabularyLearningContext(saved, {bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  expect(result.sense?.example).toBe('Mix the flour and water into a smooth paste.');
});

test('legacy metadata omissions do not block enrichment but actual personal edits remain', () => {
  const raw = entry('paste');
  delete raw.senses[0].wordFamily; delete raw.senses[0].register;
  raw.senses[0].definition = 'My cooking note about paste.';
  raw.senses[0].example = 'Use the paste from my recipe.';
  const before = structuredClone(raw);
  const result = resolveVocabularyLearningContext(raw, {bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  expect(result.sense?.definition).toBe(raw.senses[0].definition);
  expect(result.sense?.example).toBe(raw.senses[0].example);
  expect(raw).toEqual(before);
});
