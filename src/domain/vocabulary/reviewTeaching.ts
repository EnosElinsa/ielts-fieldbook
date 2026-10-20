import type { VocabularyMode, VocabularyStore } from './types';

/** A conservative preparation scope, before any teaching/task eligibility is read. */
export function vocabularyReviewTeaching(state: Partial<VocabularyStore>, mode: VocabularyMode, dueOnly: boolean, wrongOnly: boolean, now = Date.now()) {
  const saved = new Set((state.vocabulary || []).filter(entry => !entry.tags.includes('archived')).map(entry => entry.id));
  if (!dueOnly && !wrongOnly) return {entryIds: [...saved].sort(), nextChangeAt: null};
  const ids = new Set<string>();
  let nextChangeAt: number | null = null;
  // Match the queue's duplicate-state resolution without resolving teaching yet.
  const meanings = new Map((state.vocabularyStates || []).map(row => [`${row.entryId}:${row.senseId}`, row]));
  for (const row of meanings.values()) {
    if (!saved.has(row.entryId) || wrongOnly && (!row.wrong?.active || !row.wrong.modes?.[mode]?.active)) continue;
    if (dueOnly) {
      const value = row.cards?.[mode]?.due;
      const due = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
      if (!Number.isFinite(due)) continue;
      if (due > now) {
        nextChangeAt = nextChangeAt === null ? due : Math.min(nextChangeAt, due);
        continue;
      }
    }
    ids.add(row.entryId);
  }
  return {entryIds: [...ids].sort(), nextChangeAt};
}
