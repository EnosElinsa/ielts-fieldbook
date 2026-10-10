import { expect, test } from 'vitest';
import { addVocabularyItem, getVocabularyReviewQueue, recordVocabularyReview } from '../../src/domain/vocabulary';
import { matchesDictationSpelling } from '../../src/domain/vocabulary/spelling';
import { resolveRegionalSpellingWrongWords } from '../../src/domain/vocabulary/regionalWrongWords';
import { evaluateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import type { VocabularyStore } from '../../src/domain/vocabulary/types';
import { presentVocabularySession } from '../../src/domain/vocabulary/sessionPresentation';
import type { VocabularySessionRecord } from '../../src/domain/vocabulary/session';

const fresh = (): VocabularyStore => ({ vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] });
test.each([
  ['colour', 'COLOR'], ['organisations', 'organizations'], ['travelling', 'traveling'],
  ['shopping centre', 'shopping center'], ['theatres', 'theaters'], ['cancelled', 'canceled'],
  ['analyse', 'analyze'], ['grey-coloured', 'gray-colored'], ['metres', 'meters'],
  ['practise', 'practice'], ['licence', 'license'], ['programmes', 'programs'],
])('dictation accepts regional spellings: %s / %s', (uk, us) => {
  expect(matchesDictationSpelling(uk, us)).toBe(true);
  expect(matchesDictationSpelling(us, uk)).toBe(true);
  const state = fresh(); addVocabularyItem(state, { term: uk });
  expect(evaluateVocabularySessionAnswer(getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: false })[0], us).result).toBe('success');
});
test.each([['colour', 'colur'], ['metre', 'metro'], ['organ', 'orgon'], ['price', 'prize'], ['advice', 'advise'], ['colour', 'colors'], ['shopping centre', 'shopping centers'], ['grey', ''], ['humorous', 'humourous']])('rejects genuine spelling or form errors: %s / %s', (word, response) => {
  expect(matchesDictationSpelling(word, response)).toBe(false);
});
test('regional equivalence does not change vocabulary identity or non-dictation grading', () => {
  const state = fresh(); addVocabularyItem(state, { term: 'colour', meaning: 'A visual property.' }); addVocabularyItem(state, { term: 'color', meaning: 'A visual property.' });
  expect(state.vocabulary).toHaveLength(2);
  expect(evaluateVocabularySessionAnswer(getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false }).find(card => card.entry.term === 'colour')!, 'color').result).toBe('failure');
});
test('clears only regional dictation flags and retains original histories and other modes', () => {
  const state = fresh(); const entry = addVocabularyItem(state, { term: 'colour' }).item!;
  recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result: 'failure', response: 'color', occurredAt: '2026-01-01T00:00:00Z' });
  recordVocabularyReview(state, { entryId: entry.id, mode: 'definition', result: 'failure', response: '', occurredAt: '2026-01-02T00:00:00Z' });
  const history = JSON.stringify([state.vocabularyReviews, state.vocabularyEvidence, state.vocabularyStates[0].cards, state.vocabularyStates[0].dimensions]);
  expect(resolveRegionalSpellingWrongWords(state)).toHaveLength(1);
  expect(state.vocabularyStates[0].wrong.modes.dictation?.active).toBe(false);
  expect(state.vocabularyStates[0].wrong.active).toBe(true);
  expect(JSON.stringify([state.vocabularyReviews, state.vocabularyEvidence, state.vocabularyStates[0].cards, state.vocabularyStates[0].dimensions])).toBe(history);
  expect(resolveRegionalSpellingWrongWords(state)).toEqual([]);
});
test('leaves genuine and unknown failures in the wrong list', () => {
  const state = fresh(); const entry = addVocabularyItem(state, { term: 'colour' }).item!;
  recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result: 'failure', response: 'colur', occurredAt: '2026-01-01T00:00:00Z' });
  recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result: 'failure', response: 'color', occurredAt: '2026-01-02T00:00:00Z' });
  expect(resolveRegionalSpellingWrongWords(state)).toEqual([]);
  state.vocabularyReviews = []; state.vocabularyEvidence = [];
  expect(resolveRegionalSpellingWrongWords(state)).toEqual([]);
});
test('undated imported answers can prove a regional error without invented dates', () => {
  const state = fresh(); const entry = addVocabularyItem(state, { term: 'travelling' }).item!;
  const learning = state.vocabularyStates[0]; learning.wrong.active = true; learning.wrong.modes.dictation = { active: true, successesSinceFailure: 0 };
  state.vocabularyReviews.push({ id: 'imported', entryId: entry.id, senseId: learning.senseId, mode: 'dictation', result: 'failure', response: 'traveling', occurredAt: null, updatedAt: '2026-01-01', imported: true });
  state.vocabularyImportBatches.push({ id: 'batch', summaries: [{ entryId: entry.id, currentlyWrong: true, undatedHistory: [{ correct: false, response: 'traveling' }] }] });
  expect(resolveRegionalSpellingWrongWords(state)).toEqual([learning.id]);
  expect(state.vocabularyReviews[0].occurredAt).toBeNull();
});
test('historical dictation presentation corrects regional answers without changing stored submissions', () => {
  const record = { mode: 'dictation', summary: { total: 3, correct: 0, incorrect: 2, pending: 1 }, results: [
    { expectedAnswer: 'colour', term: 'colour', response: 'color', result: 'failure', errorType: 'missing letters' },
    { expectedAnswer: 'colour', term: 'colour', response: 'colur', result: 'failure' },
    { expectedAnswer: 'colour', term: 'colour', response: '', result: 'pending' },
  ] } as VocabularySessionRecord;
  const original = JSON.stringify(record);
  const shown = presentVocabularySession(record);
  expect(shown.summary).toEqual({ total: 3, correct: 1, incorrect: 1, pending: 1 });
  expect(shown.results[0]).not.toHaveProperty('errorType');
  expect(shown.results[1].result).toBe('failure');
  expect(JSON.stringify(record)).toBe(original);
  const other = { ...record, mode: 'definition' as const };
  expect(presentVocabularySession(other)).toBe(other);
});
