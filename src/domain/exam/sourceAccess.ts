import type { ExamAttempt, IntensiveSession } from './types';

/** Resolve local/cloud revisions and the newest attempt in each plan/retry scope. */
export function hasActiveSourceMock(sectionId: string, skill: ExamAttempt['skill'], attempts: ExamAttempt[]) {
  const latestById = new Map<string, ExamAttempt>();
  const newer = (next: ExamAttempt, prior: ExamAttempt) => {
    const nextTime = next.updatedAt || next.completedAt || next.startedAt || '';
    const priorTime = prior.updatedAt || prior.completedAt || prior.startedAt || '';
    return nextTime > priorTime || (nextTime === priorTime && next.status === 'completed');
  };
  attempts.forEach((attempt, index) => {
    if (!attempt || attempt.skill !== skill || attempt.mode !== 'mock' || !Array.isArray(attempt.sectionIds) || !attempt.sectionIds.includes(sectionId)) return;
    const key = attempt.id || `legacy:${index}`;
    const prior = latestById.get(key);
    if (!prior || newer(attempt, prior)) latestById.set(key, attempt);
  });
  const latestByScope = new Map<string, ExamAttempt>();
  latestById.forEach(attempt => {
    const key = JSON.stringify([attempt.sourceId, attempt.retryOfAttemptId, attempt.planId]);
    const prior = latestByScope.get(key);
    if (!prior || newer(attempt, prior)) latestByScope.set(key, attempt);
  });
  return [...latestByScope.values()].some(attempt => attempt.status === 'active' || attempt.status === 'paused');
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
