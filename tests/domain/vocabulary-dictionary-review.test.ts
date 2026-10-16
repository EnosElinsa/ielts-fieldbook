import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import { addVocabularyItem, normalizeVocabularyCollections } from '../../src/domain/vocabulary';
import { emptyState } from '../../src/domain';
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = catalog.entries.find((e: VocabularyEntry) => e.term === 'bank') as VocabularyEntry;
const raw = JSON.parse(readFileSync(`public/dictionary/${index.bank}`, 'utf8')).senses.find((s: VocabularySense) => s.id === 'kaikki:c130710755a265600e') as VocabularySense;

test('a selected additional sense keeps its enrichment and its own distinction exercise on reopening', () => {
  const selected = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
  const saved = { ...entry, senses: [structuredClone(selected), ...entry.senses] };
  expect(reviewedEntry(saved).senses.find(s => s.id === raw.id)?.collocations).toContain('river bank');
  const task = learningTask(saved, selected, 'distinction');
  expect(task?.options).toEqual(['bank', 'shore']);
  expect(task?.acceptedAnswers).toEqual(['bank']);
  expect(task?.prompt).toContain('river');
});

test('intentional edits to a selected dictionary meaning remain intact', () => {
  const selected = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
  const edited = { ...selected, definition: 'The river edge we surveyed in class.', example: '', collocations: [], distinctions: [] };
  expect(supplementVocabularySense(entry.id, edited, [raw], hasVocabularySenseEdits)).toEqual(edited);
});

test('clearing only a supplemented note remains an intentional edit', () => {
  const selected = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
  for (const patch of [{ collocations: [] }, { distinctions: [] }, { example: '' }]) {
    const edited = { ...selected, ...patch };
    expect(supplementVocabularySense(entry.id, edited, [raw], hasVocabularySenseEdits)).toEqual(edited);
  }
});

test('saving a dictionary choice retains the exercise and both source and editorial attribution', () => {
  const selected = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
  const state = emptyState();
  const result = addVocabularyItem(state, { ...entry, senses: [selected] });
  const saved = result.item!.senses.find(s => s.id === selected.id)!;
  expect(saved.distinctionTask).toEqual(selected.distinctionTask);
  expect(saved.editorial).toEqual(selected.editorial);
  expect(saved.sourceUrl).toBe(selected.sourceUrl);
});

test.each(ledger.records)('$term/$senseId survives selection, reopening and targeted practice', row => {
  const base = catalog.entries.find((e: VocabularyEntry) => e.id === row.entryId) as VocabularyEntry;
  const original = JSON.parse(readFileSync(`public/dictionary/${index[row.term]}`, 'utf8')).senses.find((s: VocabularySense) => s.id === row.senseId) as VocabularySense;
  const expected = corrections.find(s => s.entryId === row.entryId && s.senseId === row.senseId)!;
  const selected = supplementVocabularySense(row.entryId, original, [original], hasVocabularySenseEdits);
  expect(selected.definition).toBe(expected.definition);
  expect(selected.example).toBe(expected.example);
  expect(selected.collocations).toEqual(expected.collocations);
  const normalized = normalizeVocabularyCollections({ vocabulary: [{ ...base, senses: [original] }] }).vocabulary[0];
  expect(resolveVocabularyLearningContext(normalized, { senseId: row.senseId }).sense?.example).toBe(expected.example);
  const saved = { ...base, senses: [selected, ...base.senses.filter(s => s.id !== selected.id)] };
  const reopened = resolveVocabularyLearningContext(saved, { senseId: selected.id });
  expect(reopened.sense?.definition).toBe(selected.definition);
  expect(reopened.sense?.collocations).toEqual(selected.collocations);
  if ('distinctionTask' in expected && expected.distinctionTask) expect(learningTask(reopened.entry, reopened.sense!, 'distinction')?.acceptedAnswers).toEqual([expected.distinctionTask.answer]);
});

test('serializing the same distinction task in a different key order is not a learner edit', () => {
  const selected = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
  const task = selected.distinctionTask!;
  const saved = { ...selected, distinctionTask: { prompt: task.prompt, answer: task.answer, options: task.options, explanation: task.explanation } };
  expect(hasVocabularySenseEdits(saved, [selected])).toBe(false);
});

test('reviewed examples do not expose dictionary extraction tags as usage advice', () => {
  const source = JSON.parse(readFileSync(`public/dictionary/${index.current}`, 'utf8')).senses.find((s: VocabularySense) => s.id === 'kaikki:37eef87266f9b4a5fe');
  const selected = supplementVocabularySense('ve-eab4f1ac', source, [source], hasVocabularySenseEdits);
  expect(selected.usage).toBe('');
});
