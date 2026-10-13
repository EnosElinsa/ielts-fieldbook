import { afterEach, beforeEach, expect, test } from 'vitest';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { isVocabularySessionSelection } from '../../src/domain/vocabulary/selection';
import { createVocabularySession, buildVocabularySessionCommit, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { vocabularyGroupProgress } from '../../src/domain/vocabulary/progress';
import { readVocabularyDraft, writeVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { VocabularyStore } from '../../src/domain/vocabulary/types';
import { buildLearningBatch } from '../../src/domain/vocabulary/learningBatch';

const original = structuredClone(VOCABULARY_CATALOG);
const state = (): VocabularyStore => ({ vocabulary: [], vocabularyStates: [], vocabularyReviews: [], vocabularyEvidence: [], vocabularyActivities: [], vocabularySessions: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] });
const entries = Array.from({ length: 12 }, (_, index) => ({ id: `entry-${index}`, term: `term${index}`, category: 'word' as const, meaning: 'A meaning.', example: 'An example.', tags: [], sources: [{ type: 'wordbook' as const, id: `source-${index}`, bookId: 'book', unitId: 'group' }], senses: [{ id: `sense-${index}`, definition: 'A meaning.', example: 'An example.', pos: 'noun' }], createdAt: '', updatedAt: '' }));
const cards = entries.map(entry => ({ id: `${entry.id}:${entry.senses[0].id}:dictation`, entryId: entry.id, senseId: entry.senses[0].id, entry, mode: 'dictation' as const, dimension: 'spelling' as const, dueAt: '2026-10-13', sources: entry.sources, context: { bookId: 'book', unitId: 'group', entryId: entry.id, senseId: entry.senses[0].id, version: 'test-1', status: 'unreviewed' as const } }));
const batch = (index = 0) => ({ kind: 'learning-batch' as const, bookId: 'book', unitId: 'group', batchIndex: index, batchSize: 10, cards: cards.slice(index * 10, (index + 1) * 10).map(({ entryId, senseId }) => ({ entryId, senseId })) });

beforeEach(() => {
  Object.assign(VOCABULARY_CATALOG, { books: [{ id: 'book', title: 'Book' }], units: [{ id: 'group', bookId: 'book', kind: 'group', contentStatus: 'complete', entryIds: entries.map(entry => entry.id), totalSourceWords: 12 }], entries, memberships: entries.map((entry, order) => ({ id: `member-${order}`, bookId: 'book', unitId: 'group', entryId: entry.id, order })) });
  localStorage.clear();
});
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(original)));

test('frozen learning batches validate identities and reject duplicate or oversized cards', () => {
  expect(isVocabularySessionSelection(batch())).toBe(true);
  expect(isVocabularySessionSelection(batch(1))).toBe(true);
  expect(isVocabularySessionSelection({ ...batch(), cards: [batch().cards[0], batch().cards[0]] })).toBe(false);
  expect(isVocabularySessionSelection({ ...batch(), cards: cards.map(({ entryId, senseId }) => ({ entryId, senseId })) })).toBe(false);
  expect(isVocabularySessionSelection({ ...batch(), batchIndex: -1 })).toBe(false);
});

test('learning assessment keeps the frozen batch despite smaller review preferences and restores it', () => {
  const session = createVocabularySession(cards, 'dictation', { sessionSize: 1, order: 'source' }, {}, batch() as any);
  expect(session.cardIds.map(card => card.entryId)).toEqual(entries.slice(0, 10).map(entry => entry.id));
  expect(session.filter).toMatchObject({ bookId: 'book', unitId: 'group', dueOnly: false });
  expect(writeVocabularyDraft('owner', session)).toBe(true);
  expect(readVocabularyDraft('owner')?.selection).toEqual(batch());
  expect(readVocabularyDraft('owner')?.cardIds).toHaveLength(10);
});

test('changed or missing senses fail instead of replacing frozen learning targets', () => {
  const changed = { ...batch(), cards: [{ entryId: 'entry-0', senseId: 'another-sense' }] };
  expect(() => createVocabularySession(cards, 'dictation', {}, {}, changed as any)).toThrow(/unavailable|frozen|batch/i);
});

test('a final learning batch uses source order and keeps only its remaining words', () => {
  const prepared = buildLearningBatch(state(), 'book', 'group', 1, 10, 'dictation');
  expect(prepared.selection.cards).toEqual([{ entryId: 'entry-10', senseId: 'sense-10' }, { entryId: 'entry-11', senseId: 'sense-11' }]);
  expect(prepared.totalBatches).toBe(2);
  expect(prepared.mode).toBe('dictation');
  expect(() => buildLearningBatch(state(), 'book', 'group', 2, 10, 'dictation')).toThrow(/batch/i);
});

test('submitted batches accumulate whole-group progress without including unanswered words', () => {
  let current = state();
  const group = { id: 'group', bookId: 'book', entryIds: entries.map(entry => entry.id) };
  for (const index of [0, 1]) {
    let session = createVocabularySession(cards, 'dictation', {}, {}, batch(index) as any);
    for (const ref of session.cardIds) session = updateVocabularySessionAnswer(session, ref.id, entries.find(entry => entry.id === ref.entryId)!.term);
    current = buildVocabularySessionCommit(current, session, cards).state;
    expect(vocabularyGroupProgress(current, group)).toBe(index === 0 ? 'In progress' : 'Studied');
  }
  const unanswered = createVocabularySession(cards, 'dictation', {}, {}, batch(1) as any);
  const missingLast = buildVocabularySessionCommit(state(), unanswered, cards).state;
  expect(vocabularyGroupProgress(missingLast, group)).toBe('Not started');
});
