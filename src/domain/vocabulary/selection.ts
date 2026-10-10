import { VOCABULARY_CATALOG } from './catalog';
import { getVocabularyReviewQueue } from './index';
import { resolveVocabularyLearningContext } from './context';
import type { ReviewCard, VocabularyEntry, VocabularyMode, VocabularyStore } from './types';
import type { VocabularyPracticeMode } from './preferences';

export type VocabularySessionSelection =
  | { kind: 'unit'; bookId: string; unitId: string }
  | { kind: 'specialist'; bookId: string; unitId: string }
  | { kind: 'batch' }
  | { kind: 'retry' };

export const isVocabularySessionSelection = (value: unknown): value is VocabularySessionSelection => {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (input.kind === 'batch' || input.kind === 'retry') return Object.keys(input).length === 1;
  return (input.kind === 'unit' || input.kind === 'specialist') && typeof input.bookId === 'string' && validId(input.bookId) && typeof input.unitId === 'string' && validId(input.unitId) && Object.keys(input).length === 3;
};
const validId = (value: string) => value.length > 0 && value.length <= 500 && value.trim() === value && !['__proto__', 'prototype', 'constructor'].includes(value);

export type UnitPracticeQueue = {
  cards: ReviewCard[]; totalWords: number; eligibleWords: number; archivedWords: number;
  unavailableWords: number; missingWords: number; complete: boolean;
};

/** Assemble a source-ordered, one-card-per-word queue without changing learner state. */
export function buildUnitPracticeQueue(state: Partial<VocabularyStore>, bookId: string, unitId: string, mode: VocabularyPracticeMode): UnitPracticeQueue {
  const memberships = VOCABULARY_CATALOG.memberships
    .filter(member => member.bookId === bookId && member.unitId === unitId)
    .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.entryId).localeCompare(String(b.entryId)));
  const unit = VOCABULARY_CATALOG.units.find(item => item.bookId === bookId && item.id === unitId);
  const declaredWords = Number(unit?.totalSourceWords || memberships.length);
  const byId = new Map((state.vocabulary || []).map(entry => [entry.id, entry]));
  const catalogById = new Map((VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).map(entry => [entry.id, entry]));
  const cards: ReviewCard[] = [];
  const seen = new Set<string>();
  const entries: VocabularyEntry[] = [];
  let archivedWords = 0; let unavailableWords = 0; let missingWords = Math.max(0, declaredWords - memberships.length);
  for (const membership of memberships) {
    if (seen.has(membership.entryId)) continue;
    seen.add(membership.entryId);
    const catalogEntry = catalogById.get(membership.entryId);
    const entry = byId.get(membership.entryId) || catalogEntry;
    if (!entry) { missingWords++; continue; }
    if (entry.tags.includes('archived')) { archivedWords++; continue; }
    const reviewed = resolveVocabularyLearningContext(entry, { bookId, unitId }).entry;
    const merged: VocabularyEntry = { ...reviewed, sources: [...(entry.sources || [])] };
    if (!merged.sources.some(source => source.bookId === bookId && source.unitId === unitId)) merged.sources.push({ type: 'wordbook', id: `${bookId}:${unitId}:${entry.id}`, bookId, unitId });
    entries.push(merged);
  }
  const virtual = { ...state, vocabulary: entries } as Partial<VocabularyStore>;
  const reviewMode: VocabularyMode = mode === 'audio' ? 'dictation' : mode;
  const byCardId = new Map(getVocabularyReviewQueue(virtual, { mode: reviewMode, dueOnly: false, bookId, unitId }).map(card => [card.id, card]));
  for (const entry of entries) {
    const candidate = entry.senses.map(sense => byCardId.get(`${entry.id}:${sense.id}:${reviewMode}`)).find((card): card is ReviewCard => Boolean(card));
    if (!candidate) { unavailableWords++; continue; }
    cards.push(candidate);
  }
  const complete = Boolean(unit?.contentStatus === 'complete') && memberships.length >= declaredWords && missingWords === 0;
  const totalWords = seen.size + Math.max(0, declaredWords - memberships.length);
  return { cards, totalWords, eligibleWords: cards.length, archivedWords, unavailableWords, missingWords, complete };
}
