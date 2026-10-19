import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { getVocabularyLearningPriority, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string): VocabularyEntry => catalog.entries.find((row: VocabularyEntry) => row.term === term);
const raw = (term: string, senseId: string): VocabularySense => JSON.parse(readFileSync(`public/dictionary/${index[term]}`, 'utf8')).senses.find((row: VocabularySense) => row.id === senseId);
const selected = (term: string, senseId: string) => supplementVocabularySense(entry(term).id, raw(term, senseId), [], hasVocabularySenseEdits);

test('the essential learning card uses a short present-day example while a personal sentence stays intact', () => {
  const word = entry('essential');
  const current = resolveVocabularyLearningContext(reviewedEntry(word)).sense!;
  expect(current.example).toBe('Clean water is essential for good health.');
  expect(current.collocations).toContain('essential for health');
  expect(getVocabularyLearningPriority(word.id, current)).toBe('general');
  const personal = { ...word.senses[0], example: 'My own essential example from class.' };
  expect(resolveVocabularyLearningContext({ ...word, senses: [personal, ...word.senses.slice(1)] }).sense?.example).toBe(personal.example);
});

test.each([
  ['assignment', 'kaikki:972845ca1807c9a747', 'The history assignment is due on Friday.'],
  ['survey', 'kaikki:58e6bd082054859eeb', 'The survey found that most students cycle to campus.'],
])('%s starts with its reviewed study meaning without losing its former dictionary meaning', (term, senseId, example) => {
  const word = entry(term);
  const current = reviewedEntry(word);
  expect(resolveVocabularyLearningContext(current).sense?.id).toBe(senseId);
  expect(resolveVocabularyLearningContext(current).sense?.example).toBe(example);
  expect(current.senses.some(sense => sense.id === word.senses[0].id)).toBe(true);
});

test.each(['copy', 'discount'])('%s has a usable default sentence gap with the headword answer', term => {
  const word = reviewedEntry(entry(term));
  const sense = resolveVocabularyLearningContext(word).sense!;
  const task = learningTask(word, sense, 'cloze');
  expect(task?.acceptedAnswers).toEqual([term]);
  expect(task?.prompt).toContain('_____');
});

test.each([
  ['feedback', 'kaikki:a228205c0dbe3f4e63', 'some useful feedback'],
  ['equipment', 'kaikki:8d82739194a584c438', 'two pieces of equipment'],
])('%s explains its ordinary uncountable learning use and offers a matching construction task', (term, senseId, answer) => {
  const sense = selected(term, senseId);
  expect(sense.usage).toMatch(/uncountable/);
  expect(sense.usage).not.toBe('usually');
  expect(learningTask({ ...entry(term), senses: [sense] }, sense, 'distinction')?.acceptedAnswers).toEqual([answer]);
});

test('the writing and grammar meanings of article retain different examples and practice targets', () => {
  const writing = selected('article', 'kaikki:51fde7909a602da5fe');
  const grammar = selected('article', 'kaikki:5327746118ce8e10cf');
  expect(writing.example).toBe('The article explains how the new recycling system works.');
  expect(grammar.example).toBe('In the phrase an old bridge, an is an indefinite article.');
  const word = { ...entry('article'), senses: [writing, grammar] };
  expect(resolveVocabularyLearningContext(word, { senseId: grammar.id }).sense?.id).toBe(grammar.id);
  expect(learningTask(word, writing, 'distinction')?.acceptedAnswers).toEqual(['a piece of nonfiction writing']);
  expect(learningTask(word, grammar, 'distinction')?.acceptedAnswers).toEqual(['indefinite article']);
});

test('a saved previous equipment default receives the update while an edited note keeps its wording', () => {
  const baseline = JSON.parse(readFileSync('src/domain/vocabulary/resourceCoreStudyContentBaseline.json', 'utf8'));
  const previous = baseline.restoreDefaults.find((row: { entryId: string }) => row.entryId === entry('equipment').id).sense;
  const saved = { ...entry('equipment'), senses: [previous] };
  const current = resolveVocabularyLearningContext(saved).sense!;
  expect(current.usage).toMatch(/normally uncountable/);
  expect(current.distinctionTask?.answer).toBe('two pieces of equipment');
  const personal = { ...previous, usage: 'Our class uses special equipment for fieldwork.' };
  expect(resolveVocabularyLearningContext({ ...saved, senses: [personal] }).sense?.usage).toBe(personal.usage);
});

test('an explicit standalone meaning receives its review even when its fallback came from a group binding', () => {
  const word = entry('discount');
  const senseId = 'kaikki:d741a2ffee17dc9a2d';
  const current = resolveVocabularyLearningContext(word, { senseId }).sense!;
  expect(current.example).toBe('Students get a discount on museum tickets.');
  expect(current.distinctionTask?.answer).toBe('a reduction in price');
});

test('the same discount meaning keeps the selected group example and a personal standalone replacement', () => {
  const word = entry('discount');
  const overlay = JSON.parse(readFileSync('src/domain/vocabulary/contextSenseOverlay.json', 'utf8'));
  const binding = overlay.bindings.find((row: { entryId: string; sense: VocabularySense }) => row.entryId === word.id && row.sense.id === 'kaikki:d741a2ffee17dc9a2d');
  const grouped = resolveVocabularyLearningContext(word, { bookId: binding.bookId, unitId: binding.unitId, senseId: binding.sense.id });
  expect(grouped.sense?.example).toBe(binding.sense.example);
  const personal = { ...binding.sense, example: 'Our study group gets a discount at the local bookshop.' };
  expect(resolveVocabularyLearningContext({ ...word, senses: [personal, ...word.senses] }, { senseId: personal.id }).sense?.example).toBe(personal.example);
});
