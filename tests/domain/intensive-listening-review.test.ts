import { expect, test } from 'vitest';
import { createIntensiveSession, recordIntensiveListeningReview } from '../../src/domain/exam/intensive';
import { normalizeExamStore } from '../../src/domain/exam/store';

const completed = { ...createIntensiveSession('part', 's1', '2026-11-01T00:00:00Z'), stage: 6, completedAt: '2026-11-01T00:00:00Z', nextReviewAt: '2026-11-05T00:00:00Z', gist: 'Train journey', transcriptInput: 'The train leaves at nine.', shadowingAudioId: 'old-recording', dictationResult: 'partial' as const, selfRating: 4 as const, blindReplayDone: true };
const review = { reviewedAt: '2026-11-08T20:00:00Z', selfRating: 5 as const };

test('listening review keeps the full practice evidence and records independent recall and scheduling', () => {
  const next = recordIntensiveListeningReview(completed, review);
  expect(next).toMatchObject({ completedAt: completed.completedAt, stage: 6, transcriptInput: completed.transcriptInput, shadowingAudioId: completed.shadowingAudioId, selfRating: 4, dictationResult: 'partial', nextReviewAt: '2026-11-15T20:00:00.000Z' });
  expect(next.listeningReviews).toEqual([{ ...review, nextReviewAt: next.nextReviewAt }]);
  expect(completed).not.toHaveProperty('listeningReviews');
  expect(normalizeExamStore({ intensiveSessions: [next] }).intensiveSessions[0]).toEqual(next);
  expect(recordIntensiveListeningReview(next, review)).toEqual(next);
});

test('a weak listening recall returns soon without overwriting the original dictation result', () => {
  expect(recordIntensiveListeningReview(completed, { ...review, selfRating: 1 })).toMatchObject({ dictationResult: 'partial', nextReviewAt: '2026-11-09T20:00:00.000Z' });
  expect(recordIntensiveListeningReview(createIntensiveSession('part', 'new'), review)).not.toHaveProperty('listeningReviews');
});

test('an older completed record can receive a listening check without rewriting its practice stage', () => {
  const legacy = { ...completed, stage: 4 };
  expect(recordIntensiveListeningReview(legacy, review)).toMatchObject({ stage: 4, completedAt: legacy.completedAt, listeningReviews: [{ ...review, nextReviewAt: '2026-11-15T20:00:00.000Z' }] });
});

test('malformed listening review history is filtered during account normalization', () => {
  const row = normalizeExamStore({ intensiveSessions: [{ ...completed, listeningReviews: [null, { reviewedAt: 'bad-date', selfRating: 5 }, { ...review, selfRating: 8 }, { ...review, nextReviewAt: '2026-11-15T20:00:00Z' }] }] }).intensiveSessions[0];
  expect(row.listeningReviews).toEqual([{ ...review, nextReviewAt: '2026-11-15T20:00:00Z' }]);
});
