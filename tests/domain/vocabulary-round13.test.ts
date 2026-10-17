import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reviewedEntry, hasVocabularySenseEdits } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense, isVocabularyMeaningGroup, isVocabularyReadingNote } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
const raw = (term: string, at: number) => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses[at] as VocabularySense;
const teaching = (term: string, at: number) => supplementVocabularySense(entry(term).id, raw(term, at), [raw(term, at)], hasVocabularySenseEdits);

test.each(['check','point','draw','sound'])('%s has learning notes while preserving personal examples', term => {
  const base = entry(term), updated = reviewedEntry(base).senses[0];
  expect(updated.collocations?.length).toBeGreaterThan(0);
  expect(updated.distinctions?.length).toBeGreaterThan(0);
  const personal = { ...base.senses[0], example: 'Our own classroom sentence.' };
  expect(supplementVocabularySense(base.id, personal, [base.senses[0]], hasVocabularySenseEdits)).toEqual(personal);
});

test('draw starts with an actual drawing meaning and all six source directories remain references', () => {
  const selected = reviewedEntry(entry('draw')).senses[0];
  expect(selected.definition).toMatch(/picture|image|line/);
  for (let at = 0; at < 6; at++) expect(isVocabularyMeaningGroup(entry('draw').id, teaching('draw', at))).toBe(true);
});

test('checking in poker requires no outstanding bet to match and differs from calling', () => {
  expect(teaching('check', 23).distinctions?.join(' ')).toMatch(/outstanding|unmatched/);
  expect(teaching('check', 23).distinctions?.join(' ')).toMatch(/call/i);
});

test('logical soundness distinguishes validity from true premises', () => {
  const selected = teaching('sound', 2);
  expect(selected.distinctions?.join(' ')).toMatch(/valid/);
  expect(selected.distinctions?.join(' ')).toMatch(/true premises/);
  expect(isVocabularyReadingNote(entry('sound').id, selected)).toBe(true);
});

test('point restores percentage-point and backgammon meanings without teaching an inaccurate board division', () => {
  const rows = corrections.filter(row => row.entryId === entry('point').id);
  expect(rows.find(row => /Ellipsis of percentage point/.test(row.originalSense?.definition || ''))?.distinctions?.join(' ')).toMatch(/percentage points|relative/);
  const board = rows.find(row => /triangular.*positions/.test(row.originalSense?.definition || ''));
  expect(board?.distinctions?.join(' ')).toMatch(/24/);
  expect(board?.definition).toMatch(/triangle|triangular/);
});
