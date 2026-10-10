import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext, VOCABULARY_CONTEXT_VERSION } from '../../src/domain/vocabulary/context';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import { learningTask } from '../../src/domain/vocabulary/content';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { createVocabularySession, buildVocabularySessionCommit } from '../../src/domain/vocabulary/session';
import { writeVocabularyDraft, readVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { VocabularyEntry, VocabularyStore } from '../../src/domain/vocabulary/types';

const original = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = (term: string) => structuredClone(released.entries.find((e: VocabularyEntry) => e.term === term)) as VocabularyEntry;
const fresh = (entries: VocabularyEntry[] = []): VocabularyStore => ({ vocabulary: entries, vocabularyStates: [], vocabularyReviews: [], vocabularyEvidence: [], vocabularyActivities: [], vocabularyImportBatches: [], wordbookProgress: [], wordbookEnrollments: [] });
const resolve = (term: string, unitId: string) => resolveVocabularyLearningContext(entry(term), { bookId: 'guixue:10174', unitId });
beforeEach(() => { Object.assign(VOCABULARY_CATALOG, structuredClone(released)); localStorage.clear(); });
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(original)));

test('core binds distinct geography and fruit senses without changing notes or IDs', () => {
  const raw = entry('core'); const before = structuredClone(raw);
  const geo = resolveVocabularyLearningContext(raw, { bookId: 'guixue:10174', unitId: '21795' });
  const food = resolveVocabularyLearningContext(raw, { bookId: 'guixue:10174', unitId: '21840' });
  expect(geo.sense?.id).toBe(raw.senses[0].id);
  expect(geo.sense?.definition).toContain('Earth');
  expect(food.sense?.id).toBe('editorial:core:fruit-centre');
  expect(food.sense?.definition).toContain('seeds');
  expect(food.entry.senses[0]).toEqual(food.sense);
  expect(food.context).toMatchObject({ entryId: raw.id, senseId: food.sense!.id, status: 'reviewed', version: VOCABULARY_CONTEXT_VERSION });
  expect(food.entry.senses).toContainEqual(raw.senses[0]);
  expect(raw).toEqual(before);
  food.sense!.definition = 'Caller modification';
  expect(resolve('core', '21840').sense?.definition).toContain('fruit');
  expect(geo.sense?.synonyms).toEqual([]);
});

test.each([
  ['vegetable', '21840', /eaten as food/], ['fruit', '21840', /edible/],
  ['fruit', '21801', /flower.*seeds/], ['strip', '21840', /piece of material/],
  ['peel', '21840', /skin or outer layer/], ['peel', '21868', /remove the skin/],
  ['order', '21839', /request for food/], ['order', '21861', /command/],
  ['treat', '21839', /medical care/], ['recipe', '21839', /preparing a dish/],
])('resolves %s in %s to complete contextual content', (term, unit, expected) => {
  const result = resolve(term, unit);
  expect(result.sense?.definition).toMatch(expected);
  expect(result.sense?.example).toMatch(/[.!?]$/);
  expect(result.sense?.collocations?.length).toBeGreaterThan(1);
  expect(result.reviewed).toBe(true);
});

test('common food defaults improve standalone detail and generic group intent remains explicit', () => {
  expect(resolveVocabularyLearningContext(entry('fruit')).sense?.definition).toContain('edible');
  expect(resolveVocabularyLearningContext(entry('vegetable')).sense?.definition).toContain('eaten as food');
  expect(resolveVocabularyLearningContext(entry('fruit'), { bookId: 'unknown', unitId: 'unknown' })).toMatchObject({ status: 'unreviewed', sense: { definition: expect.stringContaining('edible') } });
  const cashier = resolveVocabularyLearningContext(entry('cashier'), { bookId: 'guixue:11320', unitId: '35003' });
  expect(cashier.sense?.definition).toContain('receives payments');
  expect(cashier).toMatchObject({ reviewed: false, contentReviewed: true, status: 'unresolved' });
});

test('same-ID learner edits and personal notes survive a public content supplement', () => {
  const raw = entry('core'); raw.senses[0].definition = 'My course note about the core.'; raw.senses[0].example = 'Keep this example.';
  const resolved = resolveVocabularyLearningContext(raw, { bookId: 'guixue:10174', unitId: '21795' });
  expect(resolved.sense).toEqual(raw.senses[0]); expect(resolved.reviewed).toBe(false);
  const peel = entry('peel'); peel.senses[0].source = 'Personal note';
  expect(resolveVocabularyLearningContext(peel, { bookId: 'guixue:10174', unitId: '21868' }).sense).toEqual(peel.senses[0]);
});

test('explicit sense route overrides group binding and missing explicit identity does not fall back', () => {
  const geo = resolve('core', '21795');
  expect(resolveVocabularyLearningContext(entry('core'), { bookId: 'guixue:10174', unitId: '21840', senseId: geo.sense!.id }).sense?.id).toBe(geo.sense!.id);
  expect(getVocabularyReviewQueue(fresh([entry('core')]), { senseId: 'missing', entryId: entry('core').id, dueOnly: false })).toEqual([]);
});

test('group mode coverage cannot silently choose another sense or attach unrelated synonym task', () => {
  expect(buildUnitPracticeQueue(fresh(), 'guixue:10174', '21839', 'synonym').cards.some(card => card.entry.term === 'order')).toBe(false);
  const sequence = getVocabularyReviewQueue(fresh([entry('order')]), { mode: 'synonym', dueOnly: false });
  expect(sequence[0].task?.acceptedAnswers).toContain('sequence');
  const food = buildUnitPracticeQueue(fresh(), 'guixue:10174', '21839', 'definition').cards.find(card => card.entry.term === 'order')!;
  expect(food.task).toBeUndefined(); expect(food.entry.senses[0].definition).toContain('request');
  const noun = entry('fundamental');
  expect(learningTask(noun, noun.senses[0], 'synonym')).toBeUndefined();
  const adjective = resolveVocabularyLearningContext(noun, { bookId: 'guixue:10176', unitId: '21937' });
  expect(learningTask(adjective.entry, adjective.sense!, 'synonym')?.acceptedAnswers).toContain('basic');
  expect(resolveVocabularyLearningContext(entry('stable')).sense?.definition).toContain('Not changing');
  expect(resolveVocabularyLearningContext(entry('construct')).sense?.pos).toBe('verb');
});

test('queues and resolver do not create learning state or rewrite historical records', () => {
  const state = { vocabulary: [entry('peel')] }; const before = structuredClone(state);
  getVocabularyReviewQueue(state, { bookId: 'guixue:10174', unitId: '21840', dueOnly: false });
  buildUnitPracticeQueue(state, 'guixue:10174', '21840', 'definition');
  expect(state).toEqual(before); expect(Object.keys(state)).toEqual(['vocabulary']);
});

test('new editorial sense freezes context, grades after live changes, and commits only on submission', () => {
  const state = fresh(); const cards = buildUnitPracticeQueue(state, 'guixue:10174', '21840', 'definition').cards.filter(card => card.entry.term === 'core');
  const session = createVocabularySession(cards, 'definition', {}, { bookId: 'guixue:10174', unitId: '21840' }, { kind: 'unit', bookId: 'guixue:10174', unitId: '21840' });
  expect(writeVocabularyDraft('test-owner', session)).toBe(true);
  const restored = readVocabularyDraft('test-owner')!;
  restored.answers[cards[0].id] = { response: 'core', answeredAt: '2026-10-10', durationMs: 0 };
  cards[0].entry.senses[0].definition = 'Changed after creating the question';
  const committed = buildVocabularySessionCommit(state, restored, cards);
  expect(committed.results[0]).toMatchObject({ result: 'success', definition: 'The central part of a fruit containing its seeds.', context: restored.cardSnapshots![0].context });
  expect(committed.state.vocabularyStates[0].senseId).toBe('editorial:core:fruit-centre');
  expect(resolveVocabularyLearningContext(committed.state.vocabulary[0], { bookId: 'guixue:10174', unitId: '21840' }).reviewed).toBe(true);
  expect(state.vocabulary).toEqual([]);
});

test('draft and submission reject mismatched or malformed context while old drafts retain scoring', () => {
  const state = fresh([entry('recipe')]); const cards = getVocabularyReviewQueue(state, { mode: 'distinction', dueOnly: false });
  const session = createVocabularySession(cards, 'distinction', {});
  const malformed = structuredClone(session); malformed.cardSnapshots![0].context!.entryId = 'different';
  expect(writeVocabularyDraft('invalid', malformed)).toBe(false);
  expect(() => buildVocabularySessionCommit(state, malformed, cards)).toThrow('context');
  const wrongGroup = structuredClone(session); wrongGroup.selection = { kind: 'unit', bookId: 'guixue:10174', unitId: '21839' };
  expect(writeVocabularyDraft('invalid', wrongGroup)).toBe(false);
  const wrongFilter = structuredClone(session); wrongFilter.filter = { bookId: 'guixue:10174', unitId: '21839' };
  expect(writeVocabularyDraft('invalid', wrongFilter)).toBe(false);
  delete session.cardSnapshots![0].context;
  session.answers[cards[0].id] = { response: 'recipe', answeredAt: '2026-10-10', durationMs: 0 };
  expect(writeVocabularyDraft('legacy-snapshot', session)).toBe(true);
  expect(buildVocabularySessionCommit(state, session, cards).results[0].result).toBe('success');
  delete session.cardSnapshots; delete session.contentVersion;
  expect(writeVocabularyDraft('legacy-identities', session)).toBe(true);
  expect(buildVocabularySessionCommit(state, session, cards).results[0].result).toBe('success');
});
