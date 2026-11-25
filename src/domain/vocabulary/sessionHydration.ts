import type { VocabularySessionRecord } from './session';

/** One released-catalogue read needed to render a saved result with its tested words. */
export type HistoricalCatalogRequest = { bookId?: string; unitId?: string; entryIds: string[] };

const scope = (value: unknown) => typeof value === 'string' && value && value !== 'all' ? value : undefined;

/**
 * Group the catalogue reads needed to reopen a saved session directly (refresh
 * or deep link). The session-level book/unit covers `record.entryIds`; a row
 * frozen with its own `context` (mixed-book review, retry or planned sessions)
 * is read from that row's own group so each tested word can be matched to the
 * sense, part of speech, definition and example it was tested with.
 */
export function historicalCatalogRequests(record: Pick<VocabularySessionRecord, 'selection' | 'filter' | 'entryIds' | 'results' | 'cardSnapshots'>): HistoricalCatalogRequest[] {
  const selection = record.selection as { bookId?: string; unitId?: string } | undefined;
  const sessionBook = scope(selection && 'bookId' in selection ? selection.bookId : record.filter?.bookId);
  const sessionUnit = sessionBook ? scope(selection && 'unitId' in selection ? selection.unitId : record.filter?.unitId) : undefined;
  const groups = new Map<string, HistoricalCatalogRequest>();
  const add = (bookId: string | undefined, unitId: string | undefined, entryId: unknown) => {
    if (typeof entryId !== 'string' || !entryId) return;
    const key = JSON.stringify([bookId ?? null, unitId ?? null]);
    let group = groups.get(key);
    if (!group) { group = { ...(bookId ? { bookId } : {}), ...(unitId ? { unitId } : {}), entryIds: [] }; groups.set(key, group); }
    if (!group.entryIds.includes(entryId)) group.entryIds.push(entryId);
  };
  const rows = Array.isArray(record.results) ? record.results : [];
  const sessionRows = new Set(rows.filter(row => !scope(row.context?.bookId)).map(row => row.entryId));
  const contextRows = new Set(rows.filter(row => scope(row.context?.bookId)).map(row => row.entryId));
  // A word tested only under its own frozen group is not also read from the session group.
  for (const id of Array.isArray(record.entryIds) ? record.entryIds : []) if (!contextRows.has(id) || sessionRows.has(id)) add(sessionBook, sessionUnit, id);
  for (const row of rows) {
    const rowBook = scope(row.context?.bookId);
    if (rowBook) add(rowBook, scope(row.context?.unitId), row.entryId);
    else add(sessionBook, sessionUnit, row.entryId);
  }
  for (const card of Array.isArray(record.cardSnapshots) ? record.cardSnapshots : []) if (!contextRows.has(card.entryId) || sessionRows.has(card.entryId)) add(sessionBook, sessionUnit, card.entryId);
  return [...groups.values()];
}
