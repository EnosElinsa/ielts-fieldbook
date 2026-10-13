import { VOCABULARY_IDENTITIES, normalizeVocabularyRoute, normalizeVocabularyUnitId } from '../domain/vocabulary/identities';

const focusId = (value: unknown) => typeof value === 'string' ? value.replace(/^(group|chapter)-(.+)$/, (_, prefix, unit) => `${prefix}-${normalizeVocabularyUnitId(decodeURIComponent(unit))}`) : value;
/** Only migrate this account's device drafts and navigation positions. */
export function migrateVocabularyRecovery(owner: string | null) {
  if (!owner) return;
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const store = storage();
      const prefix = `fieldbook:vocabulary-position:${owner}:`;
      for (const key of Object.keys(store)) {
        if (!key.startsWith(prefix)) continue;
        const canonical = prefix + normalizeVocabularyRoute(key.slice(prefix.length));
        if (canonical === key) continue;
        const value = JSON.parse(store.getItem(key) || 'null');
        if (value) {
          value.focus = focusId(value.focus);
          value.chapters = value.chapters?.map((chapter: {id:string;open:boolean}) => ({ ...chapter, id: focusId(chapter.id) }));
          if (!store.getItem(canonical)) store.setItem(canonical, JSON.stringify(value));
          store.removeItem(key);
        }
      }
      for (const unit of VOCABULARY_IDENTITIES.units) {
        const book = VOCABULARY_IDENTITIES.books.find(book => book.id === unit.bookId)!;
        const legacy = `fieldbook:vocabulary-learning-pending:${owner}:${book.oldId}:${unit.oldId}`;
        const canonical = `fieldbook:vocabulary-learning-pending:${owner}:${book.id}:${unit.id}`;
        const old = store.getItem(legacy);
        if (!old) continue;
        const previous = store.getItem(canonical);
        const oldValue = JSON.parse(old);
        const current = previous ? JSON.parse(previous) : undefined;
        if (!current || (Number(oldValue.sequence) || Date.parse(oldValue.updatedAt) || 0) > (Number(current.sequence) || Date.parse(current.updatedAt) || 0)) store.setItem(canonical, old);
        store.removeItem(legacy);
      }
    } catch { /* Full or unavailable recovery storage must not prevent practice. */ }
  }
}
