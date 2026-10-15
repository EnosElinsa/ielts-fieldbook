import type { ExamAttempt } from './types';

export const unfinishedExamSession = (attempt: ExamAttempt) => attempt.status === 'active' || attempt.status === 'paused';

/** Local recovery and account records are revisions of an ID, never separate sessions. */
export function mergeExamSessions(...sources: ExamAttempt[][]): ExamAttempt[] {
  const sessions = new Map<string, ExamAttempt>();
  const rank = (row: ExamAttempt) => row.status === 'discarded' ? 3 : row.status === 'completed' ? 2 : 1;
  const updated = (row: ExamAttempt) => row.updatedAt || row.completedAt || row.startedAt || '';
  for (const row of sources.flat()) {
    if (!row?.id || !Array.isArray(row.sectionIds)) continue;
    const before = sessions.get(row.id);
    if (!before || updated(row) > updated(before) || updated(row) === updated(before) && rank(row) >= rank(before)) sessions.set(row.id, row);
  }
  return [...sessions.values()].sort((a, b) => updated(b).localeCompare(updated(a)));
}

export function examSessionUrl(attempt: ExamAttempt) {
  if (attempt.status === 'completed') return `/${attempt.skill}/review/${encodeURIComponent(attempt.id)}`;
  const params = new URLSearchParams({ attempt: attempt.id });
  if (attempt.retryOfAttemptId) params.set('retry', attempt.retryOfAttemptId);
  if (attempt.planId) params.set('planId', attempt.planId);
  return `/${attempt.skill}/${attempt.mode === 'mock' ? `mock/${encodeURIComponent(attempt.sourceId)}` : encodeURIComponent(attempt.sectionIds[0])}?${params}`;
}
