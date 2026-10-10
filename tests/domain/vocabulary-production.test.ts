import { expect, test } from 'vitest';
import { addVocabularyItem, createAttempt, importAssessmentText, migrateState, recordVocabularyReview } from '../../src/domain';

test('saving an essay records pending usage and only quoted feedback awards success', () => {
  const state = migrateState({});
  const entry = addVocabularyItem(state, { term: 'significant', meaning: 'Large enough to matter.' }).item;
  const attempt = createAttempt(state, { questionId: 'q', essay: 'There was a significant increase in enrolment.', skill: 'writing' }, { id: () => 'essay-1', now: () => '2026-10-10T00:00:00Z' });
  expect(attempt.vocabularyTargets).toHaveLength(1);
  expect(state.vocabularyEvidence[0].result).toBe('pending');
  expect(state.vocabularyStates[0].dimensions.usage.successes).toBe(0);
  const file = `session_id: essay-1\noverall: 6\n\n## Summary\n\nGood wording.\n\n## Vocabulary evidence\n\n| Expression | Result | Evidence |\n|---|---|---|\n| significant | success | a significant increase in enrolment |`;
  importAssessmentText(state, file, 'score.md', { id: () => 'score-1', now: () => '2026-10-11T00:00:00Z' });
  expect(state.vocabularyStates.find(s => s.entryId === entry.id).dimensions.usage.successes).toBe(1);
  importAssessmentText(state, file, 'score.md');
  expect(state.vocabularyStates.find(s => s.entryId === entry.id).dimensions.usage.successes).toBe(1);
});

test('legacy rehydration retains newer manual familiarity and FSRS cards', () => {
  const raw = { lexicon: [{ term: 'account for', status: 'learning', reviewCount: 2 }] };
  const state = migrateState(raw);
  const entry = state.vocabulary[0];
  state.vocabularyStates[0].manualStatus = 'mastered';
  recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result: 'success', occurredAt: '2026-10-10T00:00:00Z' });
  const hydrated = migrateState({ ...state, ...raw });
  expect(hydrated.vocabularyStates[0].manualStatus).toBe('mastered');
  expect(hydrated.vocabularyStates[0].cards.dictation.reps).toBe(1);
});
