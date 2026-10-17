import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reviewedEntry, hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense, isVocabularyMeaningGroup, isVocabularyReadingNote, isVocabularySpellingReference } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
const terms = ['course', 'order', 'term', 'break'];
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
const raw = (term: string, at: number) => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses[at] as VocabularySense;
const teaching = (term: string, at: number) => supplementVocabularySense(entry(term).id, raw(term, at), [raw(term, at)], hasVocabularySenseEdits);
const rowFor = (term: string, pattern: RegExp) => {
 const row = corrections.find(row => row.entryId === entry(term).id && pattern.test(row.definition || ''));
 expect(row, `${term} teaching for ${pattern}`).toBeDefined();
 return row!;
};
const restoredTeaching = (term: string, pattern: RegExp) => {
 const row = rowFor(term, pattern), source = row.originalSense as VocabularySense;
 return supplementVocabularySense(entry(term).id, source, [source], hasVocabularySenseEdits);
};

test.each(terms)('%s has a usable initial learning meaning without overwriting a personal example', term => {
 const base = entry(term), selected = reviewedEntry(base).senses[0];
 expect(selected.example.trim()).not.toBe('');
 expect(selected.collocations?.length).toBeGreaterThan(0);
 expect(selected.distinctions?.length).toBeGreaterThan(0);
 const personal = { ...base.senses[0], example: 'Our personal classroom example.' };
 expect(supplementVocabularySense(base.id, personal, [base.senses[0]], hasVocabularySenseEdits)).toEqual(personal);
});

test('course begins with the series of lessons and term begins with a lexical expression', () => {
 expect(reviewedEntry(entry('course')).senses[0].definition).toMatch(/series of lessons/);
 expect(reviewedEntry(entry('term')).senses[0].definition).toMatch(/word or phrase naming a concept/);
 expect(teaching('course', 1).example).toMatch(/ball.*curved course/);
});

test('legacy order synonym cleanup preserves a learner’s actual edits', () => {
 const base = entry('order');
 const personal = { ...base.senses[0], example: 'My classroom example.', synonyms: ['my own comparison'] };
 expect(reviewedEntry({ ...base, senses: [personal] }).senses[0]).toEqual(personal);
 const updated = reviewedEntry(base).senses[0];
 expect(reviewedEntry({ ...base, senses: [updated] }).senses[0]).toEqual(updated);
});

test('gestational dating distinguishes LMP from conception and term from full term', () => {
 const selected = restoredTeaching('term', /usual duration of gestation/);
 expect(selected.example).toMatch(/40 weeks.*last menstrual period.*38 weeks.*conception/);
 expect(selected.distinctions?.join(' ')).toMatch(/37\+0.*38\+6.*39\+0.*40\+6.*41\+0.*41\+6.*42\+0/);
 expect(isVocabularyReadingNote(entry('term').id, selected)).toBe(true);
 expect(learningTask(entry('term'), selected, 'cloze')).toBeUndefined();
});

test('the broad meaningful-unit sense remains a lexical sense rather than a source directory', () => {
 expect(isVocabularyMeaningGroup(entry('term').id, teaching('term', 4))).toBe(false);
 expect(teaching('term', 4).definition).toMatch(/meaningful unit/);
});

test('historical Scottish payment-day guidance is explicitly historical and not a current lease date', () => {
 const selected = restoredTeaching('term', /customary day/);
 expect(selected.example).toMatch(/1911.*Whitsunday.*Martinmas/);
 expect(selected.usage).toMatch(/Historical Scottish/);
 expect(selected.distinctions?.join(' ')).toMatch(/does not establish.*current lease/);
 expect(isVocabularyReadingNote(entry('term').id, selected)).toBe(true);
});

test('reaction order uses empirical power-law exponents without a universal stoichiometric rule', () => {
 const selected = teaching('order', 18);
 expect(selected.definition).toMatch(/power-law/);
 expect(selected.distinctions?.join(' ')).toMatch(/experimentally.*fractional, negative or zero/);
 expect(selected.distinctions?.join(' ')).toMatch(/not predictable from stoichiometric coefficients/);
 expect(selected.distinctionTask?.answer).toBe('3');
});

test('mathematical additive terms and syllogism terms retain distinct explanations', () => {
 expect(restoredTeaching('term', /component of a mathematical/).distinctions?.join(' ')).toMatch(/3 and x are factors/);
 expect(restoredTeaching('term', /subject or predicate/).distinctions?.join(' ')).toMatch(/three terms.*three propositions/);
 expect(teaching('order', 21).distinctionTask?.answer).toBe('5');
});

test('a broken fever, a cushioned fall and a clean fracture do not establish a clinical outcome', () => {
 expect(restoredTeaching('break', /subside or fall substantially/).distinctions?.join(' ')).toMatch(/does not establish recovery/);
 expect(restoredTeaching('break', /interrupt or cushion a fall/).distinctions?.join(' ')).toMatch(/does not itself specify the injury outcome/);
 expect(teaching('break', 8).distinctions?.join(' ')).toMatch(/does not specify a healing time or clinical outcome/);
});

test('historical carriage break remains a valid alternative spelling and the rare braking verb is contextual reading', () => {
 const carriage = teaching('break', 32), verb = teaching('break', 42);
 expect(isVocabularySpellingReference(entry('break').id, carriage)).toBe(false);
 expect(carriage.distinctions?.join(' ')).toMatch(/recorded historical spelling/);
 expect(isVocabularyReadingNote(entry('break').id, verb)).toBe(true);
 expect(verb.distinctions?.join(' ')).toMatch(/normal modern verb is brake/);
});

test('golf breaking ninety means below ninety, and a tennis break requires the game to be won', () => {
 expect(restoredTeaching('break', /fewer strokes/).distinctionTask?.answer).toBe('eighty-eight');
 expect(teaching('break', 23).distinctions?.join(' ')).toMatch(/won game/);
});

for (const row of corrections.filter(row => terms.some(term => row.entryId === entry(term).id) && row.exampleKind === 'reading-note')) {
 test(`reading explanation ${row.senseId} cannot become a new sentence gap`, () => {
  const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
  const selected = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [row.originalSense as VocabularySense], hasVocabularySenseEdits);
  expect(isVocabularyReadingNote(base.id, selected)).toBe(true);
  expect(learningTask(base, selected, 'cloze')).toBeUndefined();
 });
}
