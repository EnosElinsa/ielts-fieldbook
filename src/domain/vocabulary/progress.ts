// Shared learning evidence. Each call only reads the supplied account state.
import { VOCABULARY_CATALOG } from './catalog';
import type { VocabularyStore } from './types';
export type GroupProgress = 'Not started' | 'In progress' | 'Studied';
type Group = { id: string; bookId: string; studyEntryIds?: string[]; entryIds?: string[]; totalSourceWords?: number };
function historicalAttempt(row: any): boolean {
  const record = row.sourceRecord;
  return Boolean(record && String(record.id || '').trim() && String(record.book_hierarchy_id || row.unitId) === String(row.unitId) && (!record.book_id || String(row.bookId) === `guixue:${record.book_id}` || String(row.bookId) === String(record.book_id))
    && record.correct_rate !== null && record.correct_rate !== undefined && String(record.correct_rate).trim() !== '' && Number.isFinite(Number(record.correct_rate)));
}
export function vocabularyGroupProgress(state: Partial<VocabularyStore>, group: Group, learnedIds?: Set<string>): GroupProgress {
  const ids = group.studyEntryIds || group.entryIds || [];
  const rows = (state.wordbookProgress || []).filter(row => row.bookId === group.bookId && String(row.unitId) === String(group.id));
  if (rows.some(historicalAttempt)) return 'Studied';
  if (!ids.length) return 'Not started';
  let partial = rows.some(row => row.completedEntryIds?.length);
  for (const session of state.vocabularySessions || []) {
    if (session.status !== 'submitted' || session.mode === 'audio') continue;
    const selected = session.selection ? session.selection.kind === 'unit' && session.selection.bookId === group.bookId && session.selection.unitId === group.id
      : session.filter?.bookId === group.bookId && session.filter?.unitId === group.id && session.filter.dueOnly === false && !session.filter.wrongOnly;
    const answered = new Set((session.results || []).filter(result => String(result.response || '').trim()).map(result => result.entryId));
    if (ids.some(id => answered.has(id))) partial = true;
    // Specialist subsets can contribute evidence but cannot complete the group.
    if (selected && ids.every(id => answered.has(id))) return 'Studied';
  }
  const learned = learnedIds || getLearnedVocabularyIds(state);
  if (ids.some(id => learned.has(id))) partial = true;
  return partial ? 'In progress' : 'Not started';
}
export function getLearnedVocabularyIds(state: Partial<VocabularyStore>): Set<string> {
  const learned = new Set<string>();
  (state.vocabularyReviews || []).filter(review => review.result !== 'pending' || String(review.response || '').trim()).forEach(review => learned.add(review.entryId));
  (state.vocabularyStates || []).filter(item => item.manualStatus && item.manualStatus !== 'new').forEach(item => learned.add(item.entryId));
  (state.vocabularyEvidence || []).filter(item => item.mode && item.verification !== 'pending').forEach(item => learned.add(item.entryId));
  (state.vocabularySessions || []).filter(session => session.status === 'submitted' && session.mode !== 'audio').forEach(session => (session.results || []).filter(result => String(result.response || '').trim()).forEach(result => learned.add(result.entryId)));
  (state.wordbookProgress || []).forEach(row => {
    (row.completedEntryIds || []).forEach(id => learned.add(id));
    if (historicalAttempt(row)) {
      VOCABULARY_CATALOG.memberships.filter(item => item.bookId === row.bookId && String(item.unitId) === String(row.unitId)).forEach(item => learned.add(item.entryId));
      (state.vocabulary || []).filter(entry => (entry.sources || []).some(source => source.bookId === row.bookId && String(source.unitId) === String(row.unitId))).forEach(entry => learned.add(entry.id));
    }
  });
  return learned;
}
