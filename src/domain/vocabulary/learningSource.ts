import { VOCABULARY_CATALOG } from './catalog';
import { catalogVocabularyEntry } from './content';
import { resolveVocabularyLearningContext } from './context';
import { normalizeVocabularyScope } from './identities';
import type { VocabularyEntry, VocabularyStore } from './types';

/** Shared batch order before slicing. Missing resources remain prospective IDs, never cards. */
export function vocabularyLearningSource(state: Partial<VocabularyStore>, bookId: string, unitId: string, suppliedGroup?: {entryIds?: string[]; studyEntryIds?: string[]; archivedEntryIds?: string[]}) {
  ({ bookId, unitId } = normalizeVocabularyScope({ bookId, unitId }));
  const group = VOCABULARY_CATALOG.units?.find(row => row.bookId === bookId && row.id === unitId);
  const members = VOCABULARY_CATALOG.memberships.filter(row => row.bookId === bookId && row.unitId === unitId).slice().sort((a,b) => a.order - b.order);
  const metadataIds: string[] = suppliedGroup?.entryIds || group?.entryIds || [];
  const memberIds: string[] = suppliedGroup?.studyEntryIds || [...members.map(row => row.entryId), ...metadataIds];
  const archived = new Set<string>(suppliedGroup?.archivedEntryIds || group?.archivedEntryIds || []);
  const saved = new Map((state.vocabulary || []).map(entry => [entry.id, entry]));
  const entries: VocabularyEntry[] = [];
  const entryIds = [...new Set(memberIds)].filter(id => {
    const entry = saved.get(id) || catalogVocabularyEntry(id);
    if (archived.has(id) || entry?.tags.includes('archived')) return false;
    if (entry) entries.push(resolveVocabularyLearningContext(entry, {bookId, unitId}).entry);
    return true;
  });
  // Metadata with counts but no membership can still reserve future study time.
  const count = memberIds.length ? entryIds.length : Math.max(0, Number(group?.entryCount || group?.totalSourceWords || 0));
  return {entryIds, entries, count, complete: count === entries.length};
}
