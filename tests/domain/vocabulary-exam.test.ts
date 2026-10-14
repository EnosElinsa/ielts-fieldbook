import { expect, test } from 'vitest';
import { addVocabularyItem, getVocabularyReviewQueue, getActiveWrongWords, normalizeVocabularyCollections, recordVocabularyReview } from '../../src/domain/vocabulary';
import { buildVocabularySessionCommit, createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';

const fresh = () => ({ vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] }) as any;
const sense = { id: 'river', definition: 'The land beside a river.', example: 'The bank was green.', pos: 'noun' };
function collect(state: any, sectionId: string, start: number, attemptId = 'attempt') {
  return addVocabularyItem(state, { term: 'bank', senses: [sense], sources: [{ type: 'reading', id: sectionId, skill: 'reading', senseId: sense.id, exam: { sectionId, attemptId, blockId: 'p:A', paragraphId: 'A', quote: 'bank', start, end: start + 4 } } as any] }).item!;
}

test('collection merges meanings but retains repeated text occurrences without scheduling reviews', () => {
  const state = fresh();
  collect(state, 'part-one', 0); collect(state, 'part-one', 9); collect(state, 'part-one', 9); collect(state, 'part-two', 0);
  expect(state.vocabulary).toHaveLength(1);
  expect(state.vocabulary[0].senses).toHaveLength(1);
  expect(state.vocabulary[0].sources).toHaveLength(3);
  expect(state.vocabularyStates[0]).toMatchObject({ cards: {}, reviewCount: 0, manualStatus: 'new' });
  expect(state.vocabularyEvidence).toEqual([]);
  expect(state.vocabularyReviews).toEqual([]);
  expect(normalizeVocabularyCollections(state).vocabulary[0].sources).toHaveLength(3);
});

test('exam metadata normalizes its exact section identity and deduplicates across normalization', () => {
  const state = fresh();
  addVocabularyItem(state, { term: 'bank', senses: [sense], sources: [{ type: 'reading', id: 'attempt-not-section', exam: { sectionId: 'part-one', blockId: 'passage:p:A', paragraphId: 'A', quote: 'bank', start: 3, end: 7 } }] });
  expect(state.vocabulary[0].sources[0].id).toBe('part-one');
  state.vocabulary[0].sources.push(structuredClone(state.vocabulary[0].sources[0]));
  expect(normalizeVocabularyCollections(state).vocabulary[0].sources).toHaveLength(1);
});

test('review and wrong-word queues filter the exact Part and keep only that source', () => {
  const state = fresh(); const entry = collect(state, 'part-one', 0); collect(state, 'part-two', 4);
  recordVocabularyReview(state, { entryId: entry.id, senseId: 'river', mode: 'definition', result: 'failure' });
  const filter = { sourceType: 'reading', sourceId: 'part-two', mode: 'definition', dueOnly: false } as any;
  expect(getVocabularyReviewQueue(state, filter)[0].sources.map(source => source.id)).toEqual(['part-two']);
  expect(getVocabularyReviewQueue(state, { ...filter, sourceId: 'missing' })).toEqual([]);
  expect(getActiveWrongWords(state, { ...filter, sourceId: 'missing' })).toEqual([]);
});

test('submitted review evidence retains the exact Part from the frozen session', () => {
  const state = fresh(); collect(state, 'part-one', 0); collect(state, 'part-two', 4);
  const filter = { sourceType: 'reading', sourceId: 'part-two', mode: 'definition', dueOnly: false } as any;
  const cards = getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false });
  const initial = createVocabularySession(cards, 'definition', {}, filter);
  const session = updateVocabularySessionAnswer(initial, cards[0].id, 'bank');
  const committed = buildVocabularySessionCommit(state, session, cards);
  expect(committed.sessionRecord.filter).toMatchObject({ sourceId: 'part-two' });
  expect(committed.state.vocabularyEvidence[0]).toMatchObject({ sourceType: 'reading', sourceId: 'part-two' });
});
