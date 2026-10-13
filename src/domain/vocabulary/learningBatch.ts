import { VOCABULARY_CATALOG } from './catalog';
import { buildUnitPracticeQueue, isVocabularySessionSelection, type VocabularyLearningBatchSelection } from './selection';
import { VOCABULARY_PRACTICE_MODES, type VocabularyPracticeMode } from './preferences';
import { getVocabularyReviewQueue } from './index';
import { resolveVocabularyLearningContext } from './context';
import { catalogVocabularyEntry } from './content';
import type { ReviewCard, VocabularyStore } from './types';
import { normalizeVocabularyScope } from './identities';

export type LearningBatch = { selection: VocabularyLearningBatchSelection; cards: ReviewCard[]; mode: VocabularyPracticeMode; totalBatches: number };

export function buildLearningBatch(state: Partial<VocabularyStore>, bookId: string, unitId: string, batchIndex = 0, batchSize = 10, preferredMode: VocabularyPracticeMode = 'dictation', frozen?: VocabularyLearningBatchSelection['cards']): LearningBatch {
  ({ bookId, unitId } = normalizeVocabularyScope({ bookId, unitId }));
  if (!Number.isSafeInteger(batchIndex) || batchIndex < 0 || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('Invalid learning batch.');
  const members = VOCABULARY_CATALOG.memberships.filter(row => row.bookId === bookId && row.unitId === unitId).slice().sort((a, b) => a.order - b.order);
  const seen = new Set<string>();
  const entries = members.flatMap(member => {
    const entry = state.vocabulary?.find(row => row.id === member.entryId) || catalogVocabularyEntry(member.entryId);
    if (!entry || entry.tags.includes('archived') || seen.has(entry.id)) return [];
    seen.add(entry.id); return [resolveVocabularyLearningContext(entry, { bookId, unitId }).entry];
  });
  const totalBatches = Math.ceil(entries.length / batchSize);
  const refs = frozen || entries.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize).map(entry => ({ entryId: entry.id, senseId: entry.senses[0]?.id || '' }));
  const selection: VocabularyLearningBatchSelection = { kind: 'learning-batch', bookId, unitId, batchIndex, batchSize, cards: refs };
  if (!isVocabularySessionSelection(selection) || refs.some(ref => !entries.some(entry => entry.id === ref.entryId))) throw new Error('This learning batch is unavailable.');
  for (const mode of [...new Set([preferredMode, 'definition', 'dictation', ...VOCABULARY_PRACTICE_MODES.map(item => item.value)])]) {
    if (mode === 'audio') continue;
    const primary = buildUnitPracticeQueue(state, bookId, unitId, mode as VocabularyPracticeMode).cards;
    const selected = refs.map(ref => {
      const direct = primary.find(card => card.entryId === ref.entryId && card.senseId === ref.senseId);
      if (direct) return direct;
      const entry = entries.find(row => row.id === ref.entryId);
      if (!entry) return undefined;
      const resolved = resolveVocabularyLearningContext(entry, { bookId, unitId, senseId: ref.senseId });
      if (resolved.sense?.id !== ref.senseId) return undefined;
      const scoped = { ...resolved.entry, sources: [...entry.sources, { type: 'wordbook' as const, id: `${bookId}:${unitId}:${entry.id}:membership`, bookId, unitId }] };
      const card = getVocabularyReviewQueue({ ...state, vocabulary: [scoped] }, { bookId, unitId, senseId: ref.senseId, dueOnly: false, mode: mode as Exclude<VocabularyPracticeMode, 'audio'> }).find(row => row.entryId === ref.entryId && row.senseId === ref.senseId);
      return card && { ...card, context: resolved.context };
    });
    if (selected.every((card): card is ReviewCard => Boolean(card))) return { selection, cards: selected, mode: mode as VocabularyPracticeMode, totalBatches };
  }
  throw new Error('No assessment is available for every meaning in this learning batch.');
}

export function learningBatchParams(selection: VocabularyLearningBatchSelection): URLSearchParams {
  return new URLSearchParams({ bookId: selection.bookId, unitId: selection.unitId, dueOnly: 'false', batch: String(selection.batchIndex), batchSize: String(selection.batchSize), batchCards: JSON.stringify(selection.cards) });
}
