import { expect, test, vi } from 'vitest';

const catalog = vi.hoisted(() => {
  const entries = Array.from({length: 80}, (_, index) => ({
    id: `word-${index}`, term: `term-${index}`, category: 'word', meaning: `Meaning ${index}`,
    example: '', tags: [], sources: [], senses: [{id: 'one', definition: `Meaning ${index}`, example: '', pos: 'noun'}],
    createdAt: '2020-01-01', updatedAt: '2020-01-01',
  }));
  const units = [{id: 'unit', bookId: 'book', kind: 'group', order: 1, entryIds: entries.map(entry => entry.id)}];
  return {entries, units, books: [{id: 'book'}], memberships: entries.map((entry, order) => ({bookId: 'book', unitId: 'unit', entryId: entry.id, order}))};
});
vi.mock('../../src/domain/vocabulary/catalog', () => ({VOCABULARY_CATALOG: catalog}));

import { emptyState } from '../../src/domain/state';
import { recordVocabularyReview } from '../../src/domain/vocabulary';
import { ensureUnifiedPlans, nextHomeLearning } from '../../src/lib/planTemplates';

const now = new Date('2026-11-16T12:00:00');
function fixture() {
  const state = emptyState() as any;
  Object.assign(state.settings, {days: [1,2,3,4,5,6,7], skills: [], dailyMinutes: 20});
  Object.assign(state.settings.planning, {vocabularyMode: 'fixed', vocabularyMinutes: 20, newWordsPerDay: 20});
  state.settings.vocabulary.learningBatchSize = 10;
  state.vocabulary = structuredClone(catalog.entries);
  state.wordbookEnrollments = [{bookId: 'book'}];
  return state;
}
function fragment(id: string, start: number, count: number, patch = {}) {
  const entryIds = catalog.entries.slice(start, start + count).map(entry => entry.id);
  return {id, dateKey: '2026-10-28', origin: 'automatic', schemaVersion: 2, status: 'pending', skill: 'vocabulary', kind: 'vocabulary', estimatedMinutes: count, quantity: count,
    target: {type: 'vocabulary', mode: 'learning-batch', assessmentMode: 'definition', bookId: 'book', unitId: 'unit', batchIndex: 0, batchSize: 10, selectionPolicy: 'exact', binding: 'frozen', entryIds, cards: entryIds.map(entryId => ({entryId, senseId: 'one'}))}, ...patch};
}
const todayLearning = (state: any) => state.plans.filter((plan: any) => plan.dateKey === '2026-11-16' && plan.status !== 'skipped' && plan.target?.mode === 'learning-batch');

test('overdue automatic fragments replan from current progress instead of accumulating on today', () => {
  const state = fixture();
  state.plans = [fragment('old-2', 0, 2), fragment('old-3', 2, 3), fragment('moved-2', 5, 2, {dateKey: '2026-11-16', originalDateKey: '2026-10-28'}), fragment('moved-3', 7, 3, {dateKey: '2026-11-16', originalDateKey: '2026-11-03'})];
  ensureUnifiedPlans(state, undefined, now);
  const today = todayLearning(state);
  expect(today.map((plan: any) => plan.quantity)).toEqual([10, 10]);
  expect(today.flatMap((plan: any) => plan.target.entryIds)).toEqual(catalog.entries.slice(0,20).map(entry => entry.id));
  for (const id of ['old-2', 'old-3', 'moved-2', 'moved-3']) {
    expect(state.plans.find((plan: any) => plan.id === id)).toMatchObject({status: 'skipped', skipReason: 'replanned-learning'});
  }
  expect(nextHomeLearning(state, now)?.plan?.id).toBe(today[0].id);
  expect(state.vocabularySessions).toHaveLength(0);
  const before = structuredClone(state.plans);
  const persist = vi.fn();
  ensureUnifiedPlans(state, persist, now);
  expect(state.plans).toEqual(before);
  expect(persist).not.toHaveBeenCalled();
});

test('untouched generated selections adapt to a smaller daily goal without retaining overtime', () => {
  const state = fixture();
  ensureUnifiedPlans(state, undefined, now);
  state.settings.dailyMinutes = 8;
  state.settings.planning.vocabularyMinutes = 8;
  state.settings.planning.newWordsPerDay = 8;
  ensureUnifiedPlans(state, undefined, now);
  expect(todayLearning(state).map((plan: any) => plan.quantity)).toEqual([8]);
  expect(todayLearning(state)[0].target.entryIds).toEqual(catalog.entries.slice(0,8).map(entry => entry.id));
});

test('returning after repeated missed days keeps two batches and does not count missed words as learned', () => {
  const state = fixture();
  for (let day = 16; day <= 23; day++) {
    const date = `2026-11-${day}`;
    ensureUnifiedPlans(state, undefined, new Date(`${date}T12:00:00`));
    const learning = state.plans.filter((plan: any) => plan.dateKey === date && plan.status !== 'skipped');
    expect(learning.map((plan: any) => plan.quantity)).toEqual([10,10]);
    expect(learning.flatMap((plan: any) => plan.target.entryIds)).toEqual(catalog.entries.slice(0,20).map(entry => entry.id));
  }
  expect(state.vocabularyReviews).toHaveLength(0);
  expect(state.vocabularySessions).toHaveLength(0);
});

test('replanning excludes words learned since the old allocation', () => {
  const state = fixture();
  state.plans = [fragment('old', 0, 3)];
  recordVocabularyReview(state, {entryId: 'word-0', senseId: 'one', mode: 'definition', result: 'success', response: 'Meaning 0', occurredAt: '2026-11-15T12:00:00'});
  const evidence = structuredClone([state.vocabularyStates, state.vocabularyReviews, state.vocabularyEvidence]);
  ensureUnifiedPlans(state, undefined, now);
  expect(todayLearning(state).flatMap((plan: any) => plan.target.entryIds)).toEqual(catalog.entries.slice(1,21).map(entry => entry.id));
  expect([state.vocabularyStates, state.vocabularyReviews, state.vocabularyEvidence]).toEqual(evidence);
});

test.each([
  {origin: 'manual'}, {manuallyEditedAt: '2026-11-15'}, {status: 'in_progress', startedAt: '2026-11-15'},
  {draft: {answer: 'Keep this answer'}}, {restoredAt: '2026-11-15'}, {onHold: true},
  {status: 'completed', completedAt: '2026-11-15'}, {status: 'skipped', skipReason: 'user-skipped'},
])('replanning preserves committed vocabulary work: %j', patch => {
  const state = fixture();
  const plan = fragment('keep', 0, 2, {dateKey: '2026-11-16', ...patch});
  state.plans = [plan];
  const before = structuredClone(plan);
  ensureUnifiedPlans(state, undefined, now);
  expect(state.plans.find((row: any) => row.id === 'keep')).toEqual(before);
});
