import { VOCABULARY_CATALOG } from './catalog';
import { normalizeVocabularyScope } from './identities';
import { getVocabularyReviewQueue } from './index';
import { resolveVocabularyLearningContext } from './context';
import type { ReviewCard, VocabularyEntry, VocabularyMode, VocabularyStore } from './types';
import { VOCABULARY_PRACTICE_MODES, isSpecialistVocabularyMode, type VocabularyPracticeMode } from './preferences';

export function availableUnitPracticeModes(state: Partial<VocabularyStore>, bookId: string, unitId: string) {
  return VOCABULARY_PRACTICE_MODES.map(item => ({...item, queue:buildUnitPracticeQueue(state,bookId,unitId,item.value)}))
    .filter(item=>item.queue.eligibleWords > 0 && (isSpecialistVocabularyMode(item.value) || item.queue.unavailableWords === 0));
}

export type VocabularyLearningBatchSelection = {
  kind: 'learning-batch'; bookId: string; unitId: string; batchIndex: number; batchSize: number;
  cards: { entryId: string; senseId: string }[];
};
export type VocabularySessionSelection =
  | VocabularyLearningBatchSelection
  | { kind: 'planned-review'; planId: string; cards: { entryId: string; senseId: string }[] }
  | { kind: 'unit'; bookId: string; unitId: string }
  | { kind: 'specialist'; bookId: string; unitId: string }
  | { kind: 'batch' }
  | { kind: 'retry' };

export const isVocabularySessionSelection = (value: unknown): value is VocabularySessionSelection => {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (input.kind === 'batch' || input.kind === 'retry') return Object.keys(input).length === 1;
  if (input.kind === 'planned-review') {
    if (Object.keys(input).length !== 3 || typeof input.planId !== 'string' || !validId(input.planId) || !Array.isArray(input.cards) || !input.cards.length || input.cards.length > 10000) return false;
    const pairs = new Set<string>();
    return input.cards.every(card => {
      if (!card || typeof card !== 'object' || Array.isArray(card) || Object.keys(card).length !== 2 || typeof card.entryId !== 'string' || !validId(card.entryId) || typeof card.senseId !== 'string' || !validId(card.senseId)) return false;
      const key = JSON.stringify([card.entryId, card.senseId]);
      if (pairs.has(key)) return false;
      pairs.add(key); return true;
    });
  }
  if (input.kind === 'learning-batch') {
    if (Object.keys(input).length !== 6 || typeof input.bookId !== 'string' || !validId(input.bookId) || typeof input.unitId !== 'string' || !validId(input.unitId)
      || !Number.isSafeInteger(input.batchIndex) || Number(input.batchIndex) < 0 || !Number.isSafeInteger(input.batchSize) || Number(input.batchSize) < 1 || Number(input.batchSize) > 50
      || !Array.isArray(input.cards) || !input.cards.length || input.cards.length > Number(input.batchSize)) return false;
    const entries = new Set<string>();
    return input.cards.every(card => {
      if (!card || typeof card !== 'object' || Array.isArray(card) || Object.keys(card).length !== 2 || typeof card.entryId !== 'string' || !validId(card.entryId) || typeof card.senseId !== 'string' || !validId(card.senseId) || entries.has(card.entryId)) return false;
      entries.add(card.entryId); return true;
    });
  }
  return (input.kind === 'unit' || input.kind === 'specialist') && typeof input.bookId === 'string' && validId(input.bookId) && typeof input.unitId === 'string' && validId(input.unitId) && Object.keys(input).length === 3;
};
const validId = (value: string) => value.length > 0 && value.length <= 500 && value.trim() === value && !['__proto__', 'prototype', 'constructor'].includes(value);

export type UnitPracticeQueue = {
  cards: ReviewCard[]; totalWords: number; eligibleWords: number; archivedWords: number;
  unavailableWords: number; missingWords: number; complete: boolean;
};

/** Assemble a source-ordered, one-card-per-word queue without changing learner state. */
export function buildUnitPracticeQueue(state: Partial<VocabularyStore>, bookId: string, unitId: string, mode: VocabularyPracticeMode): UnitPracticeQueue {
  ({ bookId, unitId } = normalizeVocabularyScope({ bookId, unitId }));
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
    // Membership belongs to the word, not a previously selected learning sense.
    // Keep old evidence/source records intact and add the canonical unscoped link.
    if (!merged.sources.some(source => source.bookId === bookId && source.unitId === unitId && !source.senseId)) merged.sources.push({ type: 'wordbook', id: `${bookId}:${unitId}:${entry.id}:membership`, bookId, unitId });
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
