import { expect, test } from 'vitest';
import { emptyState } from '../../src/domain/state';
import { addVocabularyItem, getVocabularyReviewQueue, updateVocabularyItem } from '../../src/domain/vocabulary';
import { collectVocabularyChoice } from '../../src/domain/vocabulary/collection';

const sense = { id: 'storage', definition: 'A lockable storage compartment.', example: 'Put your bag in a locker.', pos: 'noun', source: 'Dictionary' };
const entry = { id: 'public-locker', term: 'locker', category: 'word' as const, senses: [sense], meaning: sense.definition, example: sense.example, tags: [], sources: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const source = { type: 'listening' as const, id: 'part', context: 'Use one of the lockers.', exam: { sectionId: 'part', sentenceId: 's1', quote: 'lockers', start: 15, end: 22 } };

test('collecting a saved meaning adds an occurrence and preserves personal content and learning state', () => {
  const state = emptyState();
  const personal = { ...sense, definition: 'My own definition.', example: '', source: 'Personal note' };
  addVocabularyItem(state, { ...entry, senses: [personal], sources: [{ type: 'personal', id: 'manual' }] });
  const before = structuredClone(state.vocabularyStates);
  const saved = collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  expect(saved.item?.id).toBe(entry.id);
  expect(state.vocabulary).toHaveLength(1);
  expect(state.vocabulary[0].senses).toEqual([expect.objectContaining(personal)]);
  expect(state.vocabulary[0].sources).toContainEqual({ ...source, senseId: sense.id });
  expect(state.vocabularyStates).toEqual(before);
  collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  expect(state.vocabulary[0].sources).toHaveLength(2);
});

test('a selected public meaning keeps its identity; another meaning shares the entry with independent learning', () => {
  const state = emptyState();
  collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  const other = { ...sense, id: 'ship-storage', definition: 'A storage compartment on a ship.' };
  collectVocabularyChoice(state, { term: 'locker', entry, sense: other, sources: [source] });
  expect(state.vocabulary).toHaveLength(1);
  expect(state.vocabulary[0].id).toBe(entry.id);
  expect(state.vocabulary[0].senses.map(row => row.id)).toEqual(['storage', 'ship-storage']);
  expect(state.vocabularyStates.map(row => row.senseId)).toEqual(['storage', 'ship-storage']);
  expect(state.vocabularyStates.every(row => !row.nextReviewAt && !Object.keys(row.cards).length)).toBe(true);
  expect(state.vocabularyEvidence).toEqual([]);
});

test('a pending personal word creates no wordbook and cannot generate empty assessment prompts', () => {
  const state = emptyState();
  const pending = { id: '', definition: '', example: source.context, pos: 'noun', source: 'Personal note' };
  const result = collectVocabularyChoice(state, { term: 'rucksack', sense: pending, sources: [source] });
  expect(result.item).toMatchObject({ term: 'rucksack', enrichmentPending: true });
  expect(state.wordbookEnrollments).toEqual([]);
  expect(state.wordbookProgress).toEqual([]);
  expect(getVocabularyReviewQueue(state, { dueOnly: false })).toEqual([]);
});

test('a personal meaning with different part of speech does not attach to an unrelated saved sense', () => {
  const state = emptyState();
  collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  const other = { ...sense, id: '', pos: 'verb' };
  collectVocabularyChoice(state, { term: 'locker', entry, sense: other, sources: [source] });
  expect(state.vocabulary[0].senses).toHaveLength(2);
  expect(state.vocabulary[0].senses[1]).toMatchObject({ pos: 'verb', definition: sense.definition });
  expect(state.vocabulary[0].senses[1].id).not.toBe('storage');
});

test('collecting restores an archived word without changing its learning history', () => {
  const state = emptyState();
  addVocabularyItem(state, { ...entry, tags: ['personal-tag', 'archived'] });
  const before = structuredClone(state.vocabularyStates);
  collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  expect(state.vocabulary[0].tags).toEqual(['personal-tag']);
  expect(state.vocabularyStates).toEqual(before);
});

test('a newly chosen meaning becomes usable after a pending placeholder and retains the original identities', () => {
  const state = emptyState();
  collectVocabularyChoice(state, { term: 'locker', sense: { ...sense, id: '', definition: '' }, sources: [source] });
  const pending = structuredClone(state.vocabulary[0]);
  collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] });
  expect(state.vocabulary).toHaveLength(1);
  expect(state.vocabulary[0]).toMatchObject({ id: pending.id, meaning: sense.definition, enrichmentPending: false });
  expect(state.vocabulary[0].senses.map(row => row.id)).toEqual([sense.id, pending.senses[0].id]);
  expect(getVocabularyReviewQueue(state, { dueOnly: false, mode: 'definition' }).every(row => row.senseId === sense.id)).toBe(true);
});

test('a personal sentence pattern retains the explicitly chosen type', () => {
  const state = emptyState();
  const result = collectVocabularyChoice(state, { term: 'It is worth considering', category: 'sentence', sense: { ...sense, id: '', definition: '' }, sources: [source] });
  expect(result.item?.category).toBe('sentence');
});

test('recollecting a public word after renaming its saved entry keeps entry and learning identities unique', () => {
  const state = emptyState();
  addVocabularyItem(state, entry);
  updateVocabularyItem(state, entry.id, { term: 'storage cabinet' });
  const oldLearning = structuredClone(state.vocabularyStates);
  const collected = collectVocabularyChoice(state, { term: 'locker', entry, sense, sources: [source] }).item!;
  expect(new Set(state.vocabulary.map(row => row.id)).size).toBe(2);
  expect(collected.id).not.toBe(entry.id);
  expect(state.vocabularyStates).toHaveLength(2);
  expect(state.vocabularyStates[0]).toEqual(oldLearning[0]);
  expect(state.vocabularyStates[1].entryId).toBe(collected.id);
  expect(state.vocabularyStates[1].id).not.toBe(oldLearning[0].id);
});
