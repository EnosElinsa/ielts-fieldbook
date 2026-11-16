import { expect, test } from 'vitest';
import { applyIntensiveStage, createIntensiveSession, recordIntensiveListeningReview, setIntensiveReviewEnabled } from '../../src/domain/exam/intensive';
import { dueIntensive, normalizeExamStore } from '../../src/domain/exam/store';

const completed = { ...createIntensiveSession('part', 's1', '2026-11-01T00:00:00Z'), stage: 6, completedAt: '2026-11-01T00:00:00Z', nextReviewAt: '2026-11-05T00:00:00Z', gist: 'Train journey', transcriptInput: 'The train leaves at nine.', shadowingAudioId: 'old-recording', dictationResult: 'partial' as const, selfRating: 4 as const, blindReplayDone: true };
const review = { reviewedAt: '2026-11-08T20:00:00Z', selfRating: 5 as const };

test.each(['wrong', 'partial', 'correct'] as const)('only mistaken dictations default to review: %s', dictationResult => {
  const ready = { ...completed, listened: true, stage: 4, dictationResult, completedAt: undefined };
  const next = applyIntensiveStage(ready, 'complete', review.reviewedAt);
  expect(next.completedAt).toBe(review.reviewedAt);
  expect(Boolean(next.nextReviewAt)).toBe(dictationResult !== 'correct');
});

test('explicit sentence choices override accuracy and survive account reload', () => {
  const included = setIntensiveReviewEnabled({ ...completed, dictationResult: 'correct' }, true, review.reviewedAt);
  const excluded = setIntensiveReviewEnabled(completed, false, review.reviewedAt);
  const reloaded = normalizeExamStore(JSON.parse(JSON.stringify({ intensiveSessions: [included, excluded] }))).intensiveSessions;
  expect(reloaded[0]).toMatchObject({ reviewEnabled: true, nextReviewAt: '2026-11-12T20:00:00.000Z' });
  expect(reloaded[1]).toMatchObject({ reviewEnabled: false, transcriptInput: completed.transcriptInput, shadowingAudioId: 'old-recording' });
  expect(reloaded[1].nextReviewAt).toBeUndefined();
  expect(dueIntensive(reloaded, '2026-12-01')).toEqual([reloaded[0]]);
});

test.each([['correct', true], ['wrong', false]] as const)('a choice made before completing %s dictation is respected', (dictationResult, reviewEnabled) => {
  const ready = { ...completed, listened: true, stage: 4, dictationResult, reviewEnabled, completedAt: undefined };
  expect(Boolean(applyIntensiveStage(ready, 'complete', review.reviewedAt).nextReviewAt)).toBe(reviewEnabled);
});

test('invalid stored preference values fall back to accuracy rather than becoming opt-ins', () => {
  const reloaded = normalizeExamStore({ intensiveSessions: [{ ...completed, dictationResult: 'correct', reviewEnabled: 'true' }] }).intensiveSessions;
  expect(reloaded[0].reviewEnabled).toBeUndefined();
  expect(dueIntensive(reloaded, '2026-12-01')).toEqual([]);
});

test('legacy correct dates no longer create due work, while unknown legacy grades keep existing schedules', () => {
  const correct = { ...completed, id: 'correct', dictationResult: 'correct' as const };
  const unknown = { ...completed, id: 'unknown', dictationResult: 'pending' as const };
  expect(dueIntensive([correct, completed, { ...correct, id: 'opt-in', reviewEnabled: true }, { ...completed, id: 'opt-out', reviewEnabled: false }, unknown], '2026-12-01').map(row => row.id)).toEqual([completed.id, 'opt-in', 'unknown']);
});

test('ending review records recall without another date and retains original practice evidence', () => {
  const next = recordIntensiveListeningReview(completed, { ...review, reviewEnabled: false });
  expect(next).toMatchObject({ reviewEnabled: false, transcriptInput: completed.transcriptInput, shadowingAudioId: 'old-recording', listeningReviews: [{ ...review, reviewEnabled: false }] });
  expect(next.nextReviewAt).toBeUndefined();
  expect(normalizeExamStore(JSON.parse(JSON.stringify({ intensiveSessions: [next] }))).intensiveSessions[0].listeningReviews).toEqual(next.listeningReviews);
});

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
