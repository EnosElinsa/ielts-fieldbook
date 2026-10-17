import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reviewedEntry, hasVocabularySenseEdits } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;

test('fair initially teaches equitable treatment while preserving an edited primary meaning', () => {
  const base = entry('fair');
  expect(reviewedEntry(base).senses[0].id).toBe('kaikki:437a461019b8d883c3');
  expect(reviewedEntry(base).senses[0].example).toContain('fair');
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const formerPrimary = JSON.parse(readFileSync('public/dictionary/' + index.fair, 'utf8')).senses.find((sense: VocabularySense) => sense.id === 'kaikki:e724d22d34bdd28828') as VocabularySense;
  expect(reviewedEntry({ ...base, senses: [formerPrimary] }).senses[0].id).toBe('kaikki:437a461019b8d883c3');
  const editedFormer = { ...formerPrimary, example: 'The fair copy from our own manuscript lesson.' };
  expect(reviewedEntry({ ...base, senses: [editedFormer] }).senses[0]).toEqual(editedFormer);
  const personal = { ...base.senses[0], definition: 'The literary meaning from our classroom passage.', example: 'My own reading note.' };
  expect(reviewedEntry({ ...base, senses: [personal] }).senses[0]).toEqual(personal);
});

test('lying down, putting an object down and telling falsehoods retain different verb histories', () => {
  const find = (term: string, id: string) => corrections.find(row => row.entryId === entry(term).id && row.senseId === 'kaikki:' + id);
  expect(find('lie', '479e8947f8532459ae')?.usage).toContain('lay–lain');
  expect(find('lay', '2497e6492cb6d85430')?.usage).toContain('laid–laid');
  expect(find('lie', 'c127ccaa08acb4c61e')?.usage).toContain('lied–lied');
});

test('the earlier public bear example upgrades without changing a personal sentence', () => {
  const base = entry('bear'), raw = base.senses[0];
  const previous = { ...raw, example: 'A bear emerged from the forest beside the lake.' };
  const updated = supplementVocabularySense(base.id, previous, [raw], hasVocabularySenseEdits);
  expect(updated.collocations?.length).toBeGreaterThan(0);
  const personal = { ...previous, example: 'The bear in our own story climbed a tree.' } as VocabularySense;
  expect(supplementVocabularySense(base.id, personal, [raw], hasVocabularySenseEdits)).toEqual(personal);
});
