import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { buildVocabularySessionCommit, createVocabularySession } from '../../src/domain/vocabulary/session';
import { readVocabularyDraft, writeVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { VocabularyEntry, VocabularyStore } from '../../src/domain/vocabulary/types';

const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const original = structuredClone(VOCABULARY_CATALOG);
const fresh = (): VocabularyStore => ({ vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] });
beforeEach(() => { Object.assign(VOCABULARY_CATALOG, structuredClone(released)); localStorage.clear(); });
afterEach(() => { Object.assign(VOCABULARY_CATALOG, structuredClone(original)); });

describe('reviewed priority senses in whole groups', () => {
 test('treat and recipe use reviewed medical and culinary senses', () => {
  const state = fresh();
  for (const term of ['treat','recipe']) {
   const entry = (VOCABULARY_CATALOG.entries as any[]).find(item => item.term === term); expect(entry).toBeTruthy();
   const bookId = 'guixue:10174'; const unitId = 'starter:10174';
   (VOCABULARY_CATALOG.memberships as any[]).push({id:`test:${term}`,entryId:entry.id,bookId,unitId,order:0});
   const queue = buildUnitPracticeQueue(state,bookId,unitId,'definition');
   const card = queue.cards.find(item=>item.entry.term===term); expect(card?.entry.senses[0].definition).toMatch(term==='treat'?/medical|care|condition/i:/dish|ingredient|prepar/i);
  }
 });
});

describe('whole source unit selection', () => {
  test.each([
    ['guixue:10174', '21795', 55, 'atmosphere'],
    ['guixue:11320', '35028', 235, 'abbreviation'],
  ] as const)('retains every catalog-only word in released group %s/%s', (bookId, unitId, total, firstTerm) => {
    const state = fresh();
    const before = structuredClone(state);
    const queue = buildUnitPracticeQueue(state, bookId, unitId, 'dictation');
    expect(queue).toMatchObject({ totalWords: total, eligibleWords: total, archivedWords: 0, unavailableWords: 0, missingWords: 0, complete: true });
    expect(queue.cards).toHaveLength(total);
    expect(queue.cards[0].entry.term).toBe(firstTerm);
    expect(state).toEqual(before);
    const session = createVocabularySession(queue.cards, 'dictation', { sessionSize: 20, order: 'source' }, { bookId, unitId }, { kind: 'unit', bookId, unitId });
    expect(session.cardIds).toHaveLength(total);
    expect(writeVocabularyDraft('whole-group', session)).toBe(true);
    expect(readVocabularyDraft('whole-group')?.cardIds).toHaveLength(total);
    const commit = buildVocabularySessionCommit(state, session, queue.cards);
    expect(commit.state.vocabulary).toHaveLength(total);
    expect(commit.state.vocabularyReviews).toHaveLength(total);
    expect(commit.summary.total).toBe(total);
    expect(commit.state.wordbookProgress).toHaveLength(0);
    expect(commit.summary.incorrect).toBe(total);
    expect(commit.sessionRecord.results.every(result => result.response === '')).toBe(true);
    expect(state).toEqual(before);
    const retry = buildVocabularySessionCommit(commit.state, session, queue.cards);
    expect(retry.state.vocabularyReviews).toHaveLength(total);
    expect(retry.state.vocabularySessions).toHaveLength(1);
  });

  test('sorts source positions and chooses the first eligible sense in source sense order', () => {
    const state = fresh();
    const members = VOCABULARY_CATALOG.memberships.filter(member => member.unitId === '21795');
    VOCABULARY_CATALOG.memberships = members.slice().reverse().concat(members[0]);
    const entry = structuredClone(VOCABULARY_CATALOG.entries.find(item => item.id === members[0].entryId)) as unknown as VocabularyEntry;
    entry.senses = [
      { id: 'z-first', definition: 'First definition.', example: '', pos: 'noun' },
      { id: 'a-second', definition: 'Second definition.', example: '', pos: 'noun' },
    ];
    state.vocabulary.push(entry);
    const queue = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'definition');
    expect(queue.cards[0].entry.term).toBe('atmosphere');
    expect(queue.cards[0].senseId).toBe('z-first');
    expect(queue.cards).toHaveLength(55);
    expect(queue.totalWords).toBe(55);
  });

  test('counts archived, mode-ineligible, and missing words and refuses incomplete coverage', () => {
    const state = fresh();
    const members = VOCABULARY_CATALOG.memberships.filter(member => member.unitId === '21795');
    const archived = structuredClone(VOCABULARY_CATALOG.entries.find(item => item.id === members[0].entryId)) as unknown as VocabularyEntry;
    archived.tags.push('archived'); state.vocabulary.push(archived);
    const unavailable = structuredClone(VOCABULARY_CATALOG.entries.find(item => item.id === members[1].entryId)) as unknown as VocabularyEntry;
    unavailable.senses = [{ id: 'unavailable', definition: '', example: '', pos: 'noun' }]; state.vocabulary.push(unavailable);
    VOCABULARY_CATALOG.entries = VOCABULARY_CATALOG.entries.filter(entry => entry.id !== members[2].entryId);
    const queue = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'definition');
    expect(queue).toMatchObject({ totalWords: 55, archivedWords: 1, unavailableWords: 1, missingWords: 1, eligibleWords: 52, complete: false });
    VOCABULARY_CATALOG.memberships = VOCABULARY_CATALOG.memberships.filter(member => member.id !== members[3].id);
    expect(buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'dictation').missingWords).toBe(2);
  });

  test('audio queues contain one source-ordered representative per word', () => {
    const queue = buildUnitPracticeQueue(fresh(), 'guixue:11320', '35028', 'audio');
    expect(queue.cards).toHaveLength(235);
    expect(queue.cards[0].entry.term).toBe('abbreviation');
    expect(new Set(queue.cards.map(card => card.entryId)).size).toBe(235);
    const session = createVocabularySession(queue.cards, 'audio', { sessionSize: 1 }, {}, { kind: 'unit', bookId: 'guixue:11320', unitId: '35028' });
    expect(buildVocabularySessionCommit(fresh(), session, queue.cards).summary.total).toBe(235);
  });

  test('commits personal overrides with unit source ownership and keeps partial input untouched', () => {
    const state = fresh();
    const queue = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'dictation');
    const personal = structuredClone(queue.cards[0].entry);
    personal.sources = [{ type: 'personal', id: 'my-note' }]; personal.senses[0].definition = 'My definition.';
    state.vocabulary.push(personal);
    const updated = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'dictation');
    const session = createVocabularySession(updated.cards, 'dictation', {}, {}, { kind: 'unit', bookId: 'guixue:10174', unitId: '21795' });
    const committed = buildVocabularySessionCommit(state, session, updated.cards);
    expect(committed.state.vocabulary[0].senses[0].definition).toBe('My definition.');
    expect(committed.state.vocabulary[0].sources).toContainEqual(expect.objectContaining({ bookId: 'guixue:10174', unitId: '21795' }));
    expect(committed.state.vocabularyReviews[0]).toMatchObject({ bookId: 'guixue:10174', unitId: '21795' });
    expect(state.vocabulary[0].sources).toEqual([{ type: 'personal', id: 'my-note' }]);
    const partial = { vocabulary: [personal] };
    buildUnitPracticeQueue(partial, 'guixue:10174', '21795', 'dictation');
    expect(Object.keys(partial)).toEqual(['vocabulary']);
  });

  test('persists unit membership for personal entries when only listening is submitted', () => {
    const state = fresh();
    const entry = structuredClone(VOCABULARY_CATALOG.entries.find(item => item.term === 'atmosphere')) as unknown as VocabularyEntry;
    entry.sources = [{ type: 'personal', id: 'my-note' }]; state.vocabulary.push(entry);
    const queue = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'audio');
    const session = createVocabularySession(queue.cards, 'audio', {}, {}, { kind: 'unit', bookId: 'guixue:10174', unitId: '21795' });
    expect(buildVocabularySessionCommit(state, session, queue.cards).state.vocabulary[0].sources).toContainEqual(expect.objectContaining({ bookId: 'guixue:10174', unitId: '21795' }));
  });

  test('ignores future due dates when practicing a whole source group', () => {
    const state = fresh();
    const queue = buildUnitPracticeQueue(state, 'guixue:10174', '21795', 'dictation');
    const session = createVocabularySession(queue.cards, 'dictation', {}, {}, { kind: 'unit', bookId: 'guixue:10174', unitId: '21795' });
    const committed = buildVocabularySessionCommit(state, session, queue.cards);
    committed.state.vocabularyStates.forEach(learning => { if (learning.cards.dictation) learning.cards.dictation.due = new Date('2099-01-01'); });
    expect(buildUnitPracticeQueue(committed.state, 'guixue:10174', '21795', 'dictation').cards).toHaveLength(55);
  });
});
