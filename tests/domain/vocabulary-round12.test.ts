import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reviewedEntry, hasVocabularySenseEdits } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense, isVocabularyReadingNote } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
const raw = (term: string, at: number) => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses[at] as VocabularySense;
const teaching = (term: string, at: number) => supplementVocabularySense(entry(term).id, raw(term, at), [raw(term, at)], hasVocabularySenseEdits);

test.each(['light','right','left','table'])('%s receives exact learning notes without replacing a personal example', term => {
  const base = entry(term), source = base.senses[0], updated = reviewedEntry(base).senses[0];
  expect(updated.collocations?.length).toBeGreaterThan(0);
  expect(updated.distinctions?.length).toBeGreaterThan(0);
  const personal = { ...source, example: 'My own classroom sentence for this meaning.' };
  expect(supplementVocabularySense(base.id, personal, [source], hasVocabularySenseEdits)).toEqual(personal);
});

test('the two agenda verbs retain explicit variety and procedural distinctions', () => {
  const propose = teaching('table', 7), defer = teaching('table', 8);
  expect(propose.usage).toMatch(/British|non-US/);
  expect(defer.usage).toMatch(/US/);
  expect(propose.distinctionTask?.explanation).toMatch(/consideration|discussion/);
  expect(defer.distinctions?.join(' ')).toMatch(/procedure|procedural|rules/);
});

test('left as historical permission is a reading explanation independent of left as departure', () => {
  const permit = teaching('left', 15), depart = teaching('left', 13);
  expect(isVocabularyReadingNote(entry('left').id, permit)).toBe(true);
  expect(isVocabularyReadingNote(entry('left').id, depart)).toBe(false);
  expect(permit.usage).toMatch(/historical|regional|older/i);
  expect(corrections.find(row => row.entryId === entry('left').id && row.senseId === permit.id)?.distinctionTask).toBeUndefined();
});

test('the restored backgammon table explains a quadrant without discarding the source wording', () => {
  const row = corrections.find(row => row.entryId === entry('table').id && /One half of a backgammon board/.test(row.originalSense?.definition || ''));
  expect(row).toBeDefined();
  expect(row?.definition).toMatch(/quadrant/);
  expect(row?.distinctions?.join(' ')).toMatch(/four/);
  expect(row?.originalSense?.definition).toContain('One half');
});
