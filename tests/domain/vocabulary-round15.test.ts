import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { reviewedEntry, hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense, isVocabularyMeaningGroup, isVocabularyReadingNote, isVocabularySpellingReference } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['change', 'clear', 'date', 'spring'];
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
const raw = (term: string, at: number) => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses[at] as VocabularySense;
const teaching = (term: string, at: number) => supplementVocabularySense(entry(term).id, raw(term, at), [raw(term, at)], hasVocabularySenseEdits);
const child = (term: string, pattern: RegExp) => {
  const teaching = corrections.find(row => row.entryId === entry(term).id && row.dictionaryParentSenseId && pattern.test(row.definition || ''));
  const source = sources.find(row => row.term === term && row.sense.id === teaching?.senseId);
  expect(source, `${term} child ${pattern}`).toBeDefined();
  return supplementVocabularySense(entry(term).id, source!.sense as VocabularySense, [source!.sense as VocabularySense], hasVocabularySenseEdits);
};

test.each(terms)('%s keeps personal examples independent of public teaching', term => {
  const base = entry(term), personal = { ...base.senses[0], example: 'Our personal classroom example.' };
  expect(reviewedEntry(base).senses[0].example).not.toBe('');
  expect(supplementVocabularySense(base.id, personal, [base.senses[0]], hasVocabularySenseEdits)).toEqual(personal);
});

test('initial meanings favour understanding, calendar dates and the season', () => {
  expect(reviewedEntry(entry('clear')).senses[0].definition).toMatch(/Easy to understand/);
  expect(reviewedEntry(entry('date')).senses[0].definition).toMatch(/particular day/);
  expect(reviewedEntry(entry('spring')).senses[0].definition).toMatch(/season between winter and summer/);
});

test('money returned, exchanged denominations and a train transfer stay distinct', () => {
  expect(teaching('change', 10).distinctions?.join(' ')).toMatch(/preserve the full value/);
  expect(teaching('change', 12).distinctionTask?.answer).toBe('£2');
  expect(teaching('change', 14).distinctions?.join(' ')).toMatch(/may still stop/);
});

test('bell-ringing rows include rounds in 24 permutations of four bells', () => {
  const sense = teaching('change', 16);
  expect(sense.distinctions?.join(' ')).toMatch(/24.*including rounds.*23 other rows/);
  expect(isVocabularyReadingNote(entry('change').id, sense)).toBe(true);
  expect(learningTask(entry('change'), sense, 'cloze')).toBeUndefined();
});

test('CSS clear moves below preceding floats without resetting its own float', () => {
  const sense = teaching('clear', 42);
  expect(sense.definition).toMatch(/below relevant preceding floats/);
  expect(sense.distinctions?.join(' ')).toMatch(/same block formatting context/);
  expect(sense.distinctions?.join(' ')).toMatch(/does not set float: none/);
  expect(sense.distinctionTask?.answer).toBe('clear: both');
});

test('clear distinguishes transparency, authorisation, net profit and final settlement', () => {
  expect(teaching('clear', 0).distinctions?.join(' ')).toMatch(/transparent material can still have a colour/);
  expect(teaching('clear', 16).distinctionTask?.answer).toBe('£50');
  expect(teaching('clear', 35).distinctions?.join(' ')).toMatch(/subject grants approval/);
  expect(teaching('clear', 36).distinctionTask?.answer).toBe('with');
  expect(teaching('clear', 33).distinctions?.join(' ')).toMatch(/available does not.*finally paid/);
});

test('date examples use an unambiguous written month without the erroneous source weekday', () => {
  const sense = teaching('date', 3);
  expect(sense.example).toContain('24 May 2008');
  expect(sense.example).not.toContain('Tuesday');
  expect(teaching('date', 13).distinctions?.join(' ')).toMatch(/does not imply an exact year/);
});

test('the season uses hemisphere-specific boundaries rather than a fixed equinox day', () => {
  expect(child('spring', /astronomical/).distinctions?.join(' ')).toMatch(/dates vary by year and time zone/);
  expect(child('spring', /meteorological/).definition).toMatch(/March to May.*September to November/);
});

test('spring tides concern range throughout the year, and springs can be non-coiled devices', () => {
  const tide = child('spring', /spring tide/i), device = child('spring', /mechanical component/i);
  expect(tide.example).toMatch(/high waters.*higher.*low waters lower/);
  expect(tide.distinctions?.join(' ')).toMatch(/through the year.*unrelated to the season/);
  expect(device.distinctions?.join(' ')).toMatch(/coiled, flat or other shapes/);
  expect(child('spring', /mooring/).distinctionTask?.answer).toBe('fore-and-aft');
});

test('broad spring records and valid historical forms are not directory or spelling references', () => {
  for (const at of [34, 37, 39]) expect(isVocabularyMeaningGroup(entry('spring').id, teaching('spring', at))).toBe(false);
  for (const at of [21, 22, 43]) expect(isVocabularySpellingReference(entry('spring').id, teaching('spring', at))).toBe(false);
  expect(teaching('spring', 40).distinctions?.join(' ')).toMatch(/regular springed/);
});

test('every reviewed reading explanation is labelled and excluded from new cloze tasks', () => {
  const rows = corrections.filter(row => terms.some(term => entry(term).id === row.entryId) && row.exampleKind === 'reading-note');
  expect(rows).toHaveLength(65);
  for (const row of rows) {
    const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
    const sense = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [row.originalSense as VocabularySense], hasVocabularySenseEdits);
    expect(isVocabularyReadingNote(base.id, sense), row.senseId).toBe(true);
    expect(learningTask(base, sense, 'cloze'), row.senseId).toBeUndefined();
    const personal = { ...sense, example: 'Our own example for this meaning.' };
    expect(isVocabularyReadingNote(base.id, personal), row.senseId).toBe(false);
  }
});
