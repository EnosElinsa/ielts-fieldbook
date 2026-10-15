import type { ExamAttempt, IntensiveSession } from './types';
import { mergeExamSessions, unfinishedExamSession } from './sessions';

/** Completing one session must not unlock source helpers for another unfinished mock. */
export function hasActiveSourceMock(sectionId: string, skill: ExamAttempt['skill'], attempts: ExamAttempt[]) {
  const revisions = attempts.filter(Boolean).map((attempt, index) => ({ ...attempt, id: attempt.id || `legacy:${index}`, updatedAt: attempt.updatedAt || attempt.completedAt || attempt.startedAt || '' }));
  return mergeExamSessions(revisions).some(attempt => attempt.skill === skill && attempt.mode === 'mock' && attempt.sectionIds.includes(sectionId) && unfinishedExamSession(attempt));
}

/** Apply the same reveal boundary to source back-links as to intensive practice. */
export function listeningTranscriptAccess(sectionId: string, attempts: ExamAttempt[], sessions: IntensiveSession[]) {
  const fullTranscript = attempts.some(attempt => attempt.skill === 'listening' && attempt.status === 'completed' && attempt.sectionIds.includes(sectionId));
  const latest = new Map<string, IntensiveSession>();
  for (const session of sessions) {
    if (!session || session.sectionId !== sectionId) continue;
    const before = latest.get(session.sentenceId);
    if (!before || session.updatedAt >= before.updatedAt) latest.set(session.sentenceId, session);
  }
  const sentenceIds = new Set([...latest.values()].filter(session => session.revealed && session.stage >= 2 && session.dictationResult !== 'pending').map(session => session.sentenceId));
  return { fullTranscript, sentenceIds };
}
