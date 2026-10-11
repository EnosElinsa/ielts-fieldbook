import { describe, expect, it } from 'vitest';
import { applyIntensiveStage, calculateDictationResult, createIntensiveSession, lcsDiff, nextIntensiveReview, sentenceProgress } from './intensive';

const now = '2026-10-11T04:00:00.000Z';
describe('intensive listening learning loop', () => {
  it('starts blind and does not treat empty dictation as correct', () => {
    const session = createIntensiveSession('part-1', 'sentence-1', now);
    expect(session).toMatchObject({ stage: 0, revealed: false, replayCount: 0, dictationResult: 'pending' });
    expect(calculateDictationResult('', 'The train leaves at nine.')).toBe('pending');
    expect(calculateDictationResult('The train leaves at nine', 'The train leaves at nine.')).toBe('correct');
    expect(calculateDictationResult('the train at nine', 'The train leaves at nine.')).toBe('partial');
    expect(calculateDictationResult('different words', 'The train leaves at nine.')).toBe('wrong');
  });
  it('highlights missing and inserted words without shifting matching words', () => {
    expect(lcsDiff('The train leaves nine', 'The train leaves at nine.')).toEqual([
      { text: 'The', kind: 'same' }, { text: 'train', kind: 'same' }, { text: 'leaves', kind: 'same' },
      { text: 'at', kind: 'missing' }, { text: 'nine.', kind: 'same' },
    ]);
    expect(lcsDiff('very fast train', 'fast train')).toEqual([
      { text: 'very', kind: 'extra' }, { text: 'fast', kind: 'same' }, { text: 'train', kind: 'same' },
    ]);
  });
  it('requires the completed learning steps before scheduling a sentence', () => {
    let session = createIntensiveSession('part-1', 'sentence-1', now);
    expect(applyIntensiveStage(session, 'complete', now)).toEqual(session);
    session = applyIntensiveStage(session, 'listened', now);
    session = { ...session, transcriptInput: 'The train', dictationResult: 'correct' };
    session = applyIntensiveStage(session, 'reveal', now);
    session = { ...session, shadowingAudioId: 'recording-1', selfRating: 4 };
    session = applyIntensiveStage(session, 'shadowed', now);
    session = applyIntensiveStage(session, 'blind-replayed', now);
    session = applyIntensiveStage(session, 'complete', now);
    expect(session.stage).toBe(6);
    expect(session.completedAt).toBe(now);
    expect(session.nextReviewAt).toBe('2026-10-15T04:00:00.000Z');
    expect(sentenceProgress(session)).toBe(100);
  });
  it('schedules weaker sentences sooner and uses UTC-safe intervals', () => {
    expect(nextIntensiveReview('wrong', 5, now)).toBe('2026-10-12T04:00:00.000Z');
    expect(nextIntensiveReview('partial', 4, now)).toBe('2026-10-13T04:00:00.000Z');
    expect(nextIntensiveReview('correct', 5, now)).toBe('2026-10-18T04:00:00.000Z');
    expect(nextIntensiveReview('correct', 1, now)).toBe('2026-10-12T04:00:00.000Z');
  });
  it('starts delayed review with fresh recall, dictation and shadowing', () => {
    const prior = { ...createIntensiveSession('part-1', 'sentence-1', now), stage: 6, gist: 'Train times', transcriptInput: 'The train leaves at nine', shadowingAudioId: 'old-recording', selfRating: 5 as const, dictationResult: 'correct' as const, completedAt: now, nextReviewAt: '2026-10-18T04:00:00.000Z', blindReplayDone: true };
    const reviewing = applyIntensiveStage(prior, 'review', now);
    expect(reviewing).toMatchObject({ stage: 0, gist: '', transcriptInput: '', dictationResult: 'pending', blindReplayDone: false });
    expect(reviewing.shadowingAudioId).toBeUndefined();
    expect(reviewing.selfRating).toBeUndefined();
    expect(reviewing.completedAt).toBeUndefined();
    expect(reviewing.nextReviewAt).toBe(prior.nextReviewAt);
    expect(reviewing.reviewHistory?.[0]).toMatchObject({ transcriptInput: prior.transcriptInput, shadowingAudioId: 'old-recording', completedAt: now });
  });
});
