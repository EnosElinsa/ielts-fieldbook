import { expect, test } from 'vitest';
import { mergeExamSessions, unfinishedExamSession } from './sessions';
import { normalizeExamStore, examStats } from './store';
import type { ExamAttempt } from './types';

const active = { id: 'one', skill: 'reading', mode: 'practice', sourceId: 's', sectionIds: ['s'], status: 'active', updatedAt: '2026-10-15T00:00:00Z' } as ExamAttempt;
test('independent sessions for one material survive merging while newer revisions replace their own ID', () => {
  const paused = { ...active, status: 'paused' as const, updatedAt: '2026-10-15T00:01:00Z' };
  const second = { ...active, id: 'two', status: 'completed' as const };
  const sessions = mergeExamSessions([active, second], [paused]);
  expect(sessions).toHaveLength(2); expect(sessions.find(row => row.id === active.id)?.status).toBe('paused');
  expect(sessions.filter(unfinishedExamSession)).toHaveLength(1);
});
test('discard tombstones survive normalization, defeat equal-time active revisions and never count as results', () => {
  const discarded = { ...active, status: 'discarded' as const, discardedAt: active.updatedAt };
  for (const rows of [[active, discarded], [discarded, active]]) {
    expect(mergeExamSessions(rows)[0].status).toBe('discarded');
  }
  const store = normalizeExamStore({ examAttempts: [discarded] });
  expect(store.examAttempts[0].status).toBe('discarded');
  expect(examStats(store.examAttempts).completed).toBe(0);
});
