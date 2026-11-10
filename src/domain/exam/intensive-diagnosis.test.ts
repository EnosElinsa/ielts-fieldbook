import { expect, test } from 'vitest';
import { applyIntensiveStage, createIntensiveSession, recordIntensiveListeningReview } from './intensive';
import { normalizeExamStore } from './store';

const now = '2026-11-09T12:00:00.000Z';
const completed = {
  ...createIntensiveSession('part', 's1', '2026-11-01T00:00:00.000Z'),
  stage: 6, listened: true, revealed: false, transcriptInput: 'The train leaves nine.',
  dictationResult: 'partial' as const, errorReasons: ['Weak forms', 'Word boundaries', 'Other'],
  errorNote: 'I lost the word boundary.', shadowingAudioId: 'recording', selfRating: 4 as const,
  blindReplayDone: true, completedAt: '2026-11-01T01:00:00.000Z', nextReviewAt: '2026-11-03T01:00:00.000Z',
};

test('restarting full practice archives the exact diagnosis and clears only the current note', () => {
  const restarted = applyIntensiveStage(completed, 'review', now);
  expect(restarted.reviewHistory?.at(-1)).toMatchObject({ errorReasons: ['Weak forms', 'Word boundaries', 'Other'], errorNote: 'I lost the word boundary.', dictationResult: 'partial' });
  expect(restarted.errorReasons).toEqual([]);
  expect(restarted.errorNote).toBe('');
  expect(completed.errorNote).toBe('I lost the word boundary.');
  const reloaded = normalizeExamStore(JSON.parse(JSON.stringify({ intensiveSessions: [restarted] }))).intensiveSessions[0];
  expect(reloaded.errorNote).toBe('');
  expect(reloaded.reviewHistory?.at(-1)?.errorNote).toBe('I lost the word boundary.');
});

test('a listening-only review retains diagnosis notes and the original dictation evidence', () => {
  const reviewed = recordIntensiveListeningReview(completed, { reviewedAt: now, selfRating: 5 });
  const reloaded = normalizeExamStore(JSON.parse(JSON.stringify({ intensiveSessions: [reviewed] }))).intensiveSessions[0];
  expect(reloaded).toMatchObject({ errorReasons: ['Weak forms', 'Word boundaries', 'Other'], errorNote: 'I lost the word boundary.', dictationResult: 'partial', transcriptInput: 'The train leaves nine.', stage: 6 });
});

test('a legacy session without a note restarts without inventing a historical diagnosis note', () => {
  const { errorNote: _note, ...legacy } = completed;
  const restarted = applyIntensiveStage(legacy, 'review', now);
  expect(restarted.reviewHistory?.at(-1)?.errorReasons).toEqual(['Weak forms', 'Word boundaries', 'Other']);
  expect(restarted.reviewHistory?.at(-1)?.errorNote).toBeUndefined();
  expect(restarted.errorNote).toBe('');
});

test('a correct practice can complete without any diagnosis or note', () => {
  const ready = { ...completed, stage: 4, completedAt: undefined, dictationResult: 'correct' as const, errorReasons: [], errorNote: '' };
  expect(applyIntensiveStage(ready, 'complete', now)).toMatchObject({ stage: 6, dictationResult: 'correct', errorReasons: [], completedAt: now, nextReviewAt: '2026-11-13T12:00:00.000Z' });
});
