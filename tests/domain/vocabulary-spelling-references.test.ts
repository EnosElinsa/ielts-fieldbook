import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { emptyState } from '../../src/domain';
import { getVocabularyReviewQueue, VOCABULARY_MODES } from '../../src/domain/vocabulary';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { buildVocabularySessionCommit, createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const references = corrections.filter(row => 'referenceOnly' in row && row.referenceOnly);

for (const row of references) test(`${row.entryId}/${row.senseId} keeps the spelling note out of every new exercise mode`, () => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const sense = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [row.originalSense as VocabularySense], hasVocabularySenseEdits);
  const entry = { ...base, senses: [sense] };
  for (const mode of VOCABULARY_MODES) {
    expect(getVocabularyReviewQueue({ vocabulary: [entry] }, { entryId: entry.id, senseId: sense.id, mode, dueOnly: false }), mode).toEqual([]);
    expect(learningTask(entry, sense, mode), mode).toBeUndefined();
  }
  const personal = { ...sense, definition: 'Our own valid classroom meaning.', example: `We use ${entry.term} in our classroom notes.`, source: 'Personal note' };
  expect(getVocabularyReviewQueue({ vocabulary: [{ ...entry, senses: [personal] }] }, { mode: 'definition', dueOnly: false })).toHaveLength(1);
  expect(getVocabularyReviewQueue({ vocabulary: [{ ...entry, id: 'my-independent-entry' }] }, { mode: 'definition', dueOnly: false })).toHaveLength(1);
});

test('a new spelling-reference classification leaves an already frozen session unchanged', () => {
  const row = references[0];
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const legacy = { ...row.originalSense, definition: 'The definition frozen before this content update.' } as VocabularySense;
  const state = emptyState();
  state.vocabulary = [{ ...base, senses: [legacy] }];
  const cards = getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false });
  const session = createVocabularySession(cards, 'definition', {});
  const answered = updateVocabularySessionAnswer(session, session.cardIds[0].id, base.term);
  state.vocabulary[0].senses = [supplementVocabularySense(base.id, row.originalSense as VocabularySense, [row.originalSense as VocabularySense], hasVocabularySenseEdits)];
  expect(getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false })).toEqual([]);
  const committed = buildVocabularySessionCommit(state, answered, []);
  expect(committed.summary.correct).toBe(1);
  expect(committed.results[0].definition).toBe(legacy.definition);
});
