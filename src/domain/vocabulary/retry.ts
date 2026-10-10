import { VOCABULARY_CATALOG } from './catalog';
import { isVocabularyLearningContext } from './context';
import { getVocabularyReviewQueue, normalizeAnswer } from './index';
import type { ReviewCard, VocabularyEntry, VocabularyStore } from './types';
import { evaluateVocabularySessionAnswer, type VocabularySessionRecord, type VocabularySessionResult } from './session';

/** Preserve frozen questions; only legacy dictation may follow a changed group sense. */
export function resolveVocabularyRetry(state: Partial<VocabularyStore>, record: VocabularySessionRecord, activeCards: ReviewCard[] = []): {cards: ReviewCard[]; unavailable: VocabularySessionResult[]} {
  const entries = new Map((VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).map(entry => [entry.id, entry]));
  (state.vocabulary || []).forEach(entry => entries.set(entry.id, entry));
  const snapshots = new Map((record.cardSnapshots || activeCards).map(card => [card.id, card]));
  const cards: ReviewCard[] = [];
  const unavailable: VocabularySessionResult[] = [];
  const mode = record.mode === 'audio' ? 'dictation' : record.mode;
  for (const row of record.results.filter(row => row.result === 'failure' || row.result === 'partial')) {
    const raw = entries.get(row.entryId);
    const frozen = snapshots.get(row.cardId);
    if (!raw || raw.tags.includes('archived') || normalizeAnswer(raw.term) !== normalizeAnswer(row.term)) { unavailable.push(row); continue; }
    if (frozen) {
      const sense = frozen.entry?.senses.find(sense => sense.id === row.senseId);
      const permittedSense = raw.senses.some(sense => sense.id === row.senseId) || sense?.id.startsWith('kaikki:') || sense?.id.startsWith('editorial:') && sense.source === 'Fieldbook editorial' && isVocabularyLearningContext(frozen.context, frozen);
      if (frozen.entryId === row.entryId && frozen.entry?.id === row.entryId && frozen.senseId === row.senseId && frozen.mode === mode && sense && permittedSense && normalizeAnswer(frozen.entry.term) === normalizeAnswer(raw.term) && (frozen.context === undefined || isVocabularyLearningContext(frozen.context, frozen))) cards.push(structuredClone(frozen));
      else unavailable.push(row);
      continue;
    }
    const selection = record.selection?.kind === 'unit' || record.selection?.kind === 'specialist' ? record.selection : undefined;
    const bookId = row.context?.bookId || selection?.bookId || record.filter.bookId;
    const unitId = row.context?.unitId || selection?.unitId || record.filter.unitId;
    // Old sessions can reference public words not yet copied into the learner's list.
    const member = bookId && unitId && VOCABULARY_CATALOG.memberships.some(member => member.entryId === raw.id && member.bookId === bookId && member.unitId === unitId);
    const entry = member && !raw.sources.some(source => source.bookId === bookId && source.unitId === unitId)
      ? {...raw, sources:[...raw.sources, {type:'wordbook' as const,id:`${bookId}:${unitId}:${raw.id}`,bookId,unitId}]}
      : raw;
    const candidates = getVocabularyReviewQueue({...state,vocabulary:[entry]}, {
      ...record.filter, bookId, unitId, entryId:row.entryId,
      // A legacy explicit sense filter must not suppress dictation's new group context.
      senseId: mode === 'dictation' ? undefined : row.senseId, mode, dueOnly:false,
    });
    const candidate = candidates.find(card => card.id === row.cardId) || (mode === 'dictation' ? candidates[0] : undefined);
    if (candidate) {
      const current = evaluateVocabularySessionAnswer(candidate, '');
      const sameQuestion = current.senseId === row.senseId && current.expectedAnswer === row.expectedAnswer && current.prompt === row.prompt && current.definition === row.definition && current.example === row.example;
      if (mode === 'dictation' || sameQuestion) { cards.push(structuredClone(candidate)); continue; }
    }
    unavailable.push(row);
  }
  return {cards, unavailable};
}
