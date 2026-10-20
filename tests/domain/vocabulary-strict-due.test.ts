import { expect, test } from 'vitest';
import { addVocabularyItem, getVocabularyReviewQueue, dueVocabulary, recordVocabularyReview } from '../../src/domain/vocabulary';
import type { VocabularyStore } from '../../src/domain/vocabulary/types';

function fixture() {
  const state = {} as VocabularyStore;
  const entry = addVocabularyItem(state, { term: 'orchard', meaning: 'Land planted with fruit trees.', example: 'They planted an orchard.' }, { now: () => '2020-01-01T00:00:00Z' }).item!;
  return { state, entry, now: '2026-10-20T10:00:00Z' };
}

test('strict due never substitutes creation time for a missing mode schedule', () => {
  const { state, entry, now } = fixture();
  state.vocabularyStates[0].manualStatus = 'familiar';
  expect(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: true, now })).toEqual([]);
  expect(dueVocabulary(state, now)).toEqual([]);
  expect(getVocabularyReviewQueue(state, { entryId: entry.id, mode: 'dictation', dueOnly: false, now })).toHaveLength(1);
});

test('a scheduled meaning does not make unscheduled dictation due', () => {
  const { state, entry, now } = fixture();
  recordVocabularyReview(state, { entryId: entry.id, mode: 'definition', result: 'success', response: 'fruit trees', occurredAt: '2020-01-01T00:00:00Z' });
  expect(getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: true, now })).toHaveLength(1);
  expect(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: true, now })).toEqual([]);
});

test('future and malformed schedules do not create due items', () => {
  const { state, now } = fixture();
  state.vocabularyStates[0].cards.dictation = { due: 'not-a-date' } as never;
  expect(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: true, now })).toEqual([]);
  state.vocabularyStates[0].cards.dictation = { due: '2099-01-01T00:00:00Z' } as never;
  expect(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: true, now })).toEqual([]);
});

test('mode-less legacy progress is preserved without creating a schedule in every mode', () => {
  const { state, now } = fixture();
  state.vocabularyStates[0].legacyProgress = { nextReviewAt: '2020-01-01T00:00:00Z', reviewCount: 4 };
  expect(getVocabularyReviewQueue(state, { dueOnly: true, now })).toEqual([]);
  expect(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: false, now })[0].scheduledDueAt).toBeNull();
  expect(state.vocabularyStates[0].legacyProgress.reviewCount).toBe(4);
});
