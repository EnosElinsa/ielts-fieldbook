import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { emptyState } from '../../src/domain';
import { getVocabularyReviewQueue, VOCABULARY_MODES } from '../../src/domain/vocabulary';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { hasVocabularyReadinessNotes, isVocabularyMeaningGroup, isVocabularyUsageReference, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { buildVocabularySessionCommit, createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const groups = corrections.filter(row => 'meaningGroup' in row && row.meaningGroup);

test.each(groups)('$entryId/$senseId is a source grouping, not a new practice meaning', row => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const sense = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
  const entry = { ...base, senses: [sense] };
  expect(isVocabularyMeaningGroup(entry.id, sense)).toBe(true);
  for (const candidate of [sense, row.originalSense as VocabularySense]) for (const mode of VOCABULARY_MODES) {
    expect(getVocabularyReviewQueue({ vocabulary: [{ ...entry, senses: [candidate] }] }, { entryId: entry.id, senseId: sense.id, mode, dueOnly: false }), mode).toEqual([]);
    expect(learningTask(entry, candidate, mode), mode).toBeUndefined();
  }
  expect(isVocabularyMeaningGroup('an-independent-entry', sense)).toBe(false);
  expect(isVocabularyMeaningGroup(entry.id, { ...sense, source: 'Personal note' })).toBe(false);
  expect(isVocabularyMeaningGroup(entry.id, { ...sense, pos: 'other' })).toBe(false);
  const personal = { ...sense, definition: 'Our class uses this for a delivery location.', example: 'Write the address on the envelope.' };
  expect(isVocabularyMeaningGroup(entry.id, personal)).toBe(false);
  expect(getVocabularyReviewQueue({ vocabulary: [{ ...entry, senses: [personal] }] }, { senseId: sense.id, mode: 'definition', dueOnly: false })).toHaveLength(1);
});

test('fine starts with a concrete quality meaning while a personal primary remains intact', () => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.term === 'fine') as VocabularyEntry;
  const selected = reviewedEntry(base).senses[0];
  expect(selected.definition).toBe('Of very good or excellent quality.');
  expect(isVocabularyMeaningGroup(base.id, selected)).toBe(false);
  const personal = { ...base.senses[0], definition: 'Our own quality note.', example: 'My own example.' };
  expect(reviewedEntry({ ...base, senses: [personal] }).senses[0]).toEqual(personal);
});

test('a source phrase list remains readable but is excluded from all new practice modes', () => {
  const row = corrections.find(row => row.entryId === 've-7c6f4e69' && row.senseId === 'kaikki:efa06ce0d178111a40')!;
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const sense = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
  expect(isVocabularyUsageReference(base.id, sense)).toBe(true);
  expect(hasVocabularyReadinessNotes(base.id, sense)).toBe(false);
  for (const candidate of [sense, row.originalSense as VocabularySense]) for (const mode of VOCABULARY_MODES) {
    const entry = { ...base, senses: [candidate] };
    expect(learningTask(entry, candidate, mode)).toBeUndefined();
    expect(getVocabularyReviewQueue({ vocabulary: [entry] }, { senseId: sense.id, mode, dueOnly: false })).toEqual([]);
  }
  for (const patch of [{ definition: 'My own meaning.' }, { pos: 'other' }, { source: 'Personal note' }]) expect(isVocabularyUsageReference(base.id, { ...sense, ...patch })).toBe(false);
  expect(isVocabularyUsageReference('another-entry', sense)).toBe(false);
  const personal = { ...sense, definition: 'A personal classroom meaning.', example: 'Lead the way.' };
  expect(getVocabularyReviewQueue({ vocabulary: [{ ...base, senses: [personal] }] }, { senseId: sense.id, mode: 'definition', dueOnly: false })).toHaveLength(1);
});

test('the unedited address default selects the restored postal meaning while learner edits stay independent', () => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.term === 'address') as VocabularyEntry;
  const reviewed = reviewedEntry(base);
  expect(reviewed.senses[0].definition).toBe('The delivery details identifying a property or recipient’s location.');
  expect(reviewed.senses[0].example).toBe('Please write the return address on the envelope.');
  expect(reviewed.senses.some(sense => sense.id === base.senses[0].id)).toBe(true);
  const edited = { ...base.senses[0], definition: 'The place in our own reading passage.', example: 'A personal classroom example.' };
  expect(reviewedEntry({ ...base, senses: [edited] }).senses[0]).toEqual(edited);
});

test.each([groups[0], corrections.find(row => row.senseId === 'kaikki:efa06ce0d178111a40')!])('classifying $senseId as a reference does not rewrite an already frozen exercise', row => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const legacy = { ...row.originalSense, definition: 'The definition stored by an older exercise.' } as VocabularySense;
  const state = emptyState(); state.vocabulary = [{ ...base, senses: [legacy] }];
  const cards = getVocabularyReviewQueue(state, { entryId: base.id, senseId: legacy.id, mode: 'definition', dueOnly: false });
  const session = createVocabularySession(cards, 'definition', {});
  const answered = updateVocabularySessionAnswer(session, session.cardIds[0].id, base.term);
  state.vocabulary[0].senses = [supplementVocabularySense(base.id, row.originalSense as VocabularySense, [], hasVocabularySenseEdits)];
  expect(getVocabularyReviewQueue(state, { entryId: base.id, senseId: legacy.id, mode: 'definition', dueOnly: false })).toEqual([]);
  const committed = buildVocabularySessionCommit(state, answered, []);
  expect(committed.summary.correct).toBe(1);
  expect(committed.results[0].definition).toBe(legacy.definition);
});
