// Shared learning evidence. Each call only reads the supplied account state.
import { VOCABULARY_CATALOG } from './catalog';
import { normalizeVocabularyBookId, normalizeVocabularyUnitId } from './identities';
import { getVocabularyReviewQueue } from './index';
import { vocabularyLearningTimeline } from './timeline';
import type { ReviewQueueFilter, VocabularyStore } from './types';
import { vocabularyLearningSource } from './learningSource';
export type GroupProgress = 'Not started' | 'In progress' | 'Studied';
type Group = { id: string; bookId: string; studyEntryIds?: string[]; entryIds?: string[]; totalSourceWords?: number };
function historicalAttempt(row: any): boolean {
  const record = row.sourceRecord;
  return Boolean(record && String(record.id || '').trim() && normalizeVocabularyUnitId(String(record.book_hierarchy_id || row.unitId)) === normalizeVocabularyUnitId(String(row.unitId)) && (!record.book_id || normalizeVocabularyBookId(String(row.bookId)) === normalizeVocabularyBookId(String(record.book_id)))
    && record.correct_rate !== null && record.correct_rate !== undefined && String(record.correct_rate).trim() !== '' && Number.isFinite(Number(record.correct_rate)));
}
export function vocabularyGroupProgress(state: Partial<VocabularyStore>, group: Group, learnedIds?: Set<string>): GroupProgress {
  const ids = vocabularyLearningSource(state, group.bookId, group.id, group).entryIds;
  const rows = (state.wordbookProgress || []).filter(row => row.bookId === group.bookId && String(row.unitId) === String(group.id));
  if (rows.some(historicalAttempt)) return 'Studied';
  if (!ids.length) return 'Not started';
  let partial = rows.some(row => row.completedEntryIds?.length);
  const batchAnswered = new Set<string>();
  for (const session of state.vocabularySessions || []) {
    if (session.status !== 'submitted' || session.mode === 'audio') continue;
    const selected = session.selection ? session.selection.kind === 'unit' && session.selection.bookId === group.bookId && session.selection.unitId === group.id
      : session.filter?.bookId === group.bookId && session.filter?.unitId === group.id && session.filter.dueOnly === false && !session.filter.wrongOnly;
    const answered = new Set((session.results || []).filter(result => String(result.response || '').trim()).map(result => result.entryId));
    if (session.selection?.kind === 'learning-batch' && session.selection.bookId === group.bookId && session.selection.unitId === group.id) {
      const targets = session.selection.cards;
      for (const result of session.results || []) {
        if (String(result.response || '').trim() && targets.some(ref => ref.entryId === result.entryId && ref.senseId === result.senseId)) batchAnswered.add(result.entryId);
      }
    }
    if (ids.some(id => answered.has(id))) partial = true;
    // Specialist subsets can contribute evidence but cannot complete the group.
    if (selected && ids.every(id => answered.has(id))) return 'Studied';
  }
  const learned = learnedIds || getLearnedVocabularyIds(state);
  if (ids.every(id => batchAnswered.has(id))) return 'Studied';
  if (ids.some(id => learned.has(id))) partial = true;
  return partial ? 'In progress' : 'Not started';
}
export function getLearnedVocabularyIds(state: Partial<VocabularyStore>): Set<string> {
  const learned = new Set<string>();
  (state.vocabularyReviews || []).filter(review => String(review.response || '').trim() || (review.imported && review.result !== 'pending')).forEach(review => learned.add(review.entryId));
  (state.vocabularyStates || []).filter(item => item.manualStatus && item.manualStatus !== 'new').forEach(item => learned.add(item.entryId));
  (state.vocabularyEvidence || []).filter(item => item.mode && item.verification !== 'pending' && (String(item.response || '').trim() || item.imported || (item.verification === 'objective' && !('response' in item)))).forEach(item => learned.add(item.entryId));
  (state.vocabularySessions || []).filter(session => session.status === 'submitted' && session.mode !== 'audio').forEach(session => (session.results || []).filter(result => String(result.response || '').trim()).forEach(result => learned.add(result.entryId)));
  const attemptedGroups = new Set<string>();
  (state.wordbookProgress || []).forEach(row => {
    (row.completedEntryIds || []).forEach(id => learned.add(id));
    if (historicalAttempt(row)) attemptedGroups.add(`${row.bookId}:${row.unitId}`);
  });
  if (attemptedGroups.size) {
    VOCABULARY_CATALOG.memberships.filter(item => attemptedGroups.has(`${item.bookId}:${item.unitId}`)).forEach(item => learned.add(item.entryId));
    (state.vocabulary || []).filter(entry => (entry.sources || []).some(source => attemptedGroups.has(`${source.bookId}:${source.unitId}`))).forEach(entry => learned.add(entry.id));
  }
  return learned;
}

export function getDueVocabularyReviewQueue(state: Partial<VocabularyStore>, filter: ReviewQueueFilter = {}) {
  const learned = getLearnedVocabularyIds(state);
  return getVocabularyReviewQueue(state, { ...filter, dueOnly: true }).filter(card => learned.has(card.entryId));
}

export function getVocabularyPracticeResults(state: Partial<VocabularyStore>, since = 0, now = Date.now()) {
  return vocabularyLearningTimeline(state).filter(row => {
    const date = Date.parse(row.occurredAt || '');
    return (!since || date >= since) && (!Number.isFinite(date) || date <= now);
  });
}
