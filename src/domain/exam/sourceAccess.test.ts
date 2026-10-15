import { expect, test } from 'vitest';
import { createIntensiveSession, applyIntensiveStage } from './intensive';
import { hasActiveSourceMock, listeningTranscriptAccess } from './sourceAccess';
import type { ExamAttempt } from './types';

test('a new or unfinished listening attempt cannot unlock the source transcript', () => {
  const attempt = { skill: 'listening', status: 'active', sectionIds: ['part'] } as ExamAttempt;
  expect(listeningTranscriptAccess('part', [attempt], []).fullTranscript).toBe(false);
  expect([...listeningTranscriptAccess('part', [], []).sentenceIds]).toEqual([]);
});

test('submitted work unlocks only its own listening sections', () => {
  const attempt = { skill: 'listening', status: 'completed', sectionIds: ['part'] } as ExamAttempt;
  expect(listeningTranscriptAccess('part', [attempt], []).fullTranscript).toBe(true);
  expect(listeningTranscriptAccess('other', [attempt], []).fullTranscript).toBe(false);
  expect(listeningTranscriptAccess('part', [{ ...attempt, skill: 'reading' }], []).fullTranscript).toBe(false);
});

test('intensive access opens only compared sentences and closes in blind or recall stages', () => {
  const revealed = { ...createIntensiveSession('part', 'one'), stage: 3, listened: true, revealed: true, dictationResult: 'partial' as const };
  const untouched = createIntensiveSession('part', 'two');
  expect([...listeningTranscriptAccess('part', [], [revealed, untouched]).sentenceIds]).toEqual(['one']);
  expect([...listeningTranscriptAccess('part', [], [{ ...revealed, revealed: false }]).sentenceIds]).toEqual([]);
  expect([...listeningTranscriptAccess('part', [], [applyIntensiveStage(revealed, 'review')]).sentenceIds]).toEqual([]);
  expect([...listeningTranscriptAccess('part', [], [{ ...revealed, dictationResult: 'pending' }]).sentenceIds]).toEqual([]);
});

test('a newer local hidden state overrides an older cloud reveal', () => {
  const revealed = { ...createIntensiveSession('part', 'one', '2026-10-14T00:00:00Z'), stage: 3, revealed: true, dictationResult: 'correct' as const };
  const hidden = { ...revealed, revealed: false, updatedAt: '2026-10-14T00:01:00Z' };
  expect([...listeningTranscriptAccess('part', [], [revealed, hidden]).sentenceIds]).toEqual([]);
  expect([...listeningTranscriptAccess('part', [], [hidden, revealed]).sentenceIds]).toEqual([]);
});

test('source mock access resolves newest revisions and completed ties independent of load order', () => {
  const active = { id: 'attempt', sourceId: 'paper', skill: 'reading', mode: 'mock', status: 'active', sectionIds: ['part'], updatedAt: '2026-10-14T00:00:00Z' } as ExamAttempt;
  const completed = { ...active, status: 'completed' as const };
  expect(hasActiveSourceMock('part', 'reading', [active])).toBe(true);
  expect(hasActiveSourceMock('part', 'reading', [{ ...active, status: 'paused' }])).toBe(true);
  expect(hasActiveSourceMock('other', 'reading', [active])).toBe(false);
  expect(hasActiveSourceMock('part', 'listening', [active])).toBe(false);
  expect(hasActiveSourceMock('part', 'reading', [active, completed])).toBe(false);
  expect(hasActiveSourceMock('part', 'reading', [completed, active])).toBe(false);
  const newerCompleted = { ...completed, id: 'later', updatedAt: '2026-10-14T00:01:00Z' };
  expect(hasActiveSourceMock('part', 'reading', [active, newerCompleted])).toBe(true);
  const plannedRetry = { ...active, id: 'retry', planId: 'plan', retryOfAttemptId: 'later', updatedAt: '2026-10-14T00:02:00Z' };
  expect(hasActiveSourceMock('part', 'reading', [active, newerCompleted, plannedRetry])).toBe(true);
  expect(hasActiveSourceMock('part', 'reading', [plannedRetry, newerCompleted, active, { ...plannedRetry, status: 'completed' }])).toBe(true);
  expect(hasActiveSourceMock('part', 'reading', [active, { ...active, status: 'discarded' }])).toBe(false);
});
