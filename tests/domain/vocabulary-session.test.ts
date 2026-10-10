import { afterEach, describe, expect, test, vi } from 'vitest';
import { addVocabularyItem, getVocabularyReviewQueue, setVocabularyManualStatus } from '../../src/domain/vocabulary';
import { buildVocabularySessionCommit, createVocabularySession, evaluateVocabularySessionAnswer, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import type { VocabularyStore } from '../../src/domain/vocabulary/types';

const fresh = (): VocabularyStore => ({ vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] });
function fixture(mode: 'dictation' | 'production' | 'distinction' = 'dictation') {
  const state = fresh();
  addVocabularyItem(state, { term: 'bank', senses: [{ id: 'money', definition: 'An institution that holds money.', example: 'The bank holds money.', pos: 'noun', synonyms: ['lender'], distinctions: ['Not a river bank.'] }, { id: 'river', definition: 'The land beside a river.', example: 'The river bank flooded.', pos: 'noun' }] });
  addVocabularyItem(state, { term: 'testword', meaning: 'A word used for testing.', example: 'A testword appears.' });
  return { state, cards: getVocabularyReviewQueue(state, { mode, dueOnly: false }) };
}

afterEach(() => vi.restoreAllMocks());

describe('vocabulary sessions', () => {
  test('takes a bounded ID-only snapshot and deduplicates dictation across senses', () => {
    const { cards } = fixture();
    const session = createVocabularySession(cards.concat(cards), 'dictation', { sessionSize: 100 }, { bookId: 'book' });
    expect(session.cardIds).toHaveLength(2);
    expect(new Set(session.cardIds.map(card => card.entryId)).size).toBe(2);
    expect(session).toMatchObject({ status: 'active', index: 0, answers: {}, filter: { bookId: 'book' } });
    expect(JSON.stringify(session)).not.toContain('An institution');
    expect(createVocabularySession(cards, 'dictation', { sessionSize: 1 }).cardIds).toHaveLength(1);
  });

  test('keeps non-dictation senses distinct and sorts due order before bounding', () => {
    const { cards } = fixture('production');
    cards[0].dueAt = '2030-01-01T00:00:00Z';
    cards[1].dueAt = '2020-01-01T00:00:00Z';
    const session = createVocabularySession(cards, 'production', { sessionSize: 100, order: 'due' });
    expect(session.cardIds).toHaveLength(3);
    expect(session.cardIds[0].id).toBe(cards[1].id);
  });

  test('saves edits immutably and rejects unknown cards or already submitted sessions', () => {
    const { cards } = fixture();
    const session = createVocabularySession(cards, 'dictation', {});
    const updated = updateVocabularySessionAnswer(session, session.cardIds[0].id, 'BANK', { durationMs: 750 });
    expect(updated.answers[session.cardIds[0].id]).toMatchObject({ response: 'BANK', durationMs: 750 });
    expect(session.answers).toEqual({});
    expect(() => updateVocabularySessionAnswer(session, 'missing', 'answer')).toThrow();
    expect(() => updateVocabularySessionAnswer({ ...session, status: 'submitted' }, session.cardIds[0].id, 'answer')).toThrow();
  });

  test('compares normalized objective answers and detects unfinished answers', () => {
    const { cards } = fixture();
    const card = cards.find(card => card.entry.term === 'bank')!;
    expect(evaluateVocabularySessionAnswer(card, '  BANK  ').result).toBe('success');
    expect(evaluateVocabularySessionAnswer(card, '').result).toBe('failure');
    expect(evaluateVocabularySessionAnswer(card, '').errorType).toBe('unanswered');
    expect(evaluateVocabularySessionAnswer(card, 'bak').errorType).toBe('missing letters');
  });

  test('accepts authored distinction answers and normalizes fallback synonyms', () => {
    const { cards } = fixture('distinction');
    const card = cards[0];
    expect(evaluateVocabularySessionAnswer(card, ' LENDER ').result).toBe('success');
    card.entry.senses.find(sense => sense.id === card.senseId)!.distinctionTask = { prompt: 'Choose the meaning.', options: ['money', 'land'], answer: 'money', explanation: 'This sense holds money.' };
    expect(evaluateVocabularySessionAnswer(card, ' MONEY ').result).toBe('success');
    expect(evaluateVocabularySessionAnswer(card, 'wrong').expectedAnswer).toBe('money');
    expect(evaluateVocabularySessionAnswer(card, 'lender').result).toBe('failure');
  });

  test('production stays pending unless the learner explicitly reports a result', () => {
    const { cards } = fixture('production');
    expect(evaluateVocabularySessionAnswer(cards[0], 'A bank.').result).toBe('pending');
    expect(evaluateVocabularySessionAnswer(cards[0], 'A bank.', { result: 'success' }).result).toBe('pending');
    expect(evaluateVocabularySessionAnswer(cards[0], 'A bank.', { result: 'partial', verification: 'self-reported' }).result).toBe('partial');
    expect(evaluateVocabularySessionAnswer(cards[0], '   ').result).toBe('failure');
  });

  test('prepares one atomic cloned batch without altering unpracticed dimensions or manual familiarity', () => {
    const { state, cards } = fixture();
    const bank = cards.find(card => card.entry.term === 'bank')!;
    setVocabularyManualStatus(state, bank.entryId, 'familiar');
    let session = createVocabularySession(cards, 'dictation', {});
    session = updateVocabularySessionAnswer(session, bank.id, 'bank');
    session = { ...session, submittedAt: '2026-10-10T10:00:00.000Z' };
    const commit = buildVocabularySessionCommit(state, session, cards);
    expect(state.vocabularyReviews).toHaveLength(0);
    expect(commit.state.vocabularyReviews).toHaveLength(2);
    expect(commit.summary).toEqual({ total: 2, correct: 1, incorrect: 1, pending: 0 });
    const learning = commit.state.vocabularyStates.find(row => row.entryId === bank.entryId && row.senseId === bank.senseId)!;
    expect(learning.manualStatus).toBe('familiar');
    expect(learning.dimensions.meaning.successes).toBe(0);
    expect(learning.dimensions.listening.successes).toBe(1);
    expect(commit.sessionRecord).toMatchObject({ id: session.id, status: 'submitted', submittedAt: '2026-10-10T10:00:00.000Z' });
    expect(commit.state.vocabularyReviews[0].id).toBe(`${session.id}:${session.cardIds[0].id}`);
  });

  test('rebuilding an already persisted session keeps one review and one summary per card', () => {
    const { state, cards } = fixture();
    const session = { ...createVocabularySession(cards, 'dictation', {}), submittedAt: '2026-10-10T10:00:00.000Z' };
    const first = buildVocabularySessionCommit(state, session, cards);
    const retry = buildVocabularySessionCommit(first.state, session, cards);
    expect(retry.state.vocabularyReviews).toHaveLength(2);
    expect((retry.state as any).vocabularySessions).toHaveLength(1);
    expect(retry.state.vocabularyEvidence).toHaveLength(4);
  });

  test('refuses a batch when a frozen card was removed, archived, remapped or duplicated', () => {
    const { state, cards } = fixture();
    const session = createVocabularySession(cards, 'dictation', {});
    state.vocabulary[0].tags.push('archived');
    expect(() => buildVocabularySessionCommit(state, session, cards)).toThrow();
    state.vocabulary[0].tags = [];
    state.vocabulary[0].senses = [];
    expect(() => buildVocabularySessionCommit(state, session, cards)).toThrow();
    expect(() => buildVocabularySessionCommit(state, { ...session, cardIds: [session.cardIds[0], session.cardIds[0]] }, cards)).toThrow();
    expect(state.vocabularyReviews).toHaveLength(0);
  });

  test('audio sessions record completed listening once without vocabulary mastery or wrong-word changes', () => {
    const { state, cards } = fixture();
    let session = createVocabularySession(cards, 'audio', { mode: 'audio' });
    session = updateVocabularySessionAnswer(session, session.cardIds[0].id, 'listened');
    const commit = buildVocabularySessionCommit(state, session, cards);
    expect(commit.state.vocabularyActivities).toHaveLength(1);
    expect(commit.state.vocabularyReviews).toHaveLength(0);
    expect(commit.state.vocabularyEvidence).toHaveLength(0);
    expect(commit.summary).toEqual({ total: 2, correct: 0, incorrect: 0, pending: 0, listened: 1 });
    expect(commit.sessionRecord.reviewIds).toEqual([]);
    expect(buildVocabularySessionCommit(commit.state, session, cards).state.vocabularyActivities).toHaveLength(1);
    expect(state.vocabularyActivities).toHaveLength(0);
  });

  test('batch review events retain source and session ownership and one preparation timestamp', () => {
    const { state, cards } = fixture();
    const session = { ...createVocabularySession(cards, 'dictation', {}, { bookId: 'b', unitId: 'u' }), submittedAt: '2026-10-10T11:00:00.000Z' };
    const commit = buildVocabularySessionCommit(state, session, cards);
    expect(commit.state.vocabularyReviews[0]).toMatchObject({ sessionId: session.id, bookId: 'b', unitId: 'u', occurredAt: session.submittedAt });
    expect(commit.state.vocabularyEvidence[0]).toMatchObject({ sessionId: session.id, occurredAt: session.submittedAt });
    expect(commit.sessionRecord.reviewIds).toHaveLength(2);
  });

  test('validates the whole batch before recording a renamed or mismatched card', () => {
    const { state, cards } = fixture();
    const frozen = structuredClone(cards);
    const session = createVocabularySession(frozen, 'dictation', {});
    state.vocabulary.find(entry => entry.id === session.cardIds[1].entryId)!.term = 'renamed';
    expect(() => buildVocabularySessionCommit(state, session, frozen)).toThrow();
    expect(state.vocabularyReviews).toHaveLength(0);
    const mismatched = { ...session, cardIds: [{ ...session.cardIds[0], mode: 'definition' as const }] };
    expect(() => buildVocabularySessionCommit(state, mismatched, frozen)).toThrow();
  });

  test('normalizes bounds and leaves caller input arrays untouched', () => {
    const { cards } = fixture();
    const ids = cards.map(card => card.id);
    const session = createVocabularySession(cards, 'dictation', { sessionSize: 200, order: 'random' });
    expect(session.preferences.sessionSize).toBe(100);
    expect(cards.map(card => card.id)).toEqual(ids);
  });

  test('keeps the prepared preference and filter snapshot isolated from later caller edits', () => {
    const { state, cards } = fixture();
    const session = createVocabularySession(cards, 'dictation', {}, { bookId: 'original' });
    const commit = buildVocabularySessionCommit(state, session, cards);
    session.preferences.volume = 0;
    session.filter.bookId = 'changed';
    expect(commit.sessionRecord.preferences.volume).toBe(1);
    expect(commit.sessionRecord.filter.bookId).toBe('original');
  });
});
