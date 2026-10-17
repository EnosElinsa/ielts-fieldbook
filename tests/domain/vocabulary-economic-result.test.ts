import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
const terms = ['economic', 'economy', 'economics', 'result'];
const reviewed = ledger.records.filter(row => terms.includes(row.term));
const rows = corrections.filter(row => reviewed.some(review => review.entryId === row.entryId && review.senseId === row.senseId));
const meaning = (term: string, original: string) => rows.find(row => row.entryId === reviewed.find(review => review.term === term)?.entryId && row.originalSense.definition.startsWith(original));

test('all thirty preserved meanings and eight independently sourced children receive reviews', () => {
  expect(reviewed).toHaveLength(38);
  expect(sources.filter(row => terms.includes(row.term))).toHaveLength(8);
  expect(sources.filter(row => row.term === 'economic')).toHaveLength(0);
  for (const term of terms) expect(reviewed.some(row => row.term === term)).toBe(true);
  for (const row of rows) {
    expect(row.example.trim()).not.toBe('');
    expect(row.collocations.length).toBeGreaterThan(0);
    expect(row.distinctions.length).toBeGreaterThan(0);
  }
});

test('result from and result in preserve the direction of the causal relationship', () => {
  const from = meaning('result', 'To proceed');
  const into = meaning('result', 'To have as a consequence');
  expect(from?.example).toBe('Delays can result from missing information.');
  expect(into?.example).toBe('Missing information can result in delays.');
  expect(from?.distinctionTask?.answer).toMatch(/delays.*effect.*information.*cause/i);
  expect(into?.distinctionTask?.answer).toMatch(/information.*cause.*delays.*effect/i);
});

test('economics keeps singular study separate from plural financial considerations', () => {
  expect(meaning('economics', 'The study of resource')?.example).toBe('Economics is the study of how people allocate scarce resources.');
  const aspects = rows.find(row => row.originalSense.definition.includes('financial aspects of an activity'));
  expect(aspects?.example).toBe('The economics of the project are uncertain because costs may rise.');
  expect(aspects?.distinctions.join(' ')).toMatch(/plural agreement/);
  expect(aspects?.distinctionTask?.answer).toBe('are');
});

test('the default economy is a production system and default economics is the field of study', () => {
  for (const [term, fragment] of [['economy', 'production'], ['economics', 'study']]) {
    const entryId = reviewed.find(row => row.term === term)?.entryId;
    expect(defaults.find(row => row.entryId === entryId)?.sense.definition).toContain(fragment);
  }
});

test('the UK exclamation is lexical, and historical explanations are not invented gap examples', () => {
  const exclamation = meaning('result', 'An exclamation');
  expect(exclamation?.example).toBe('"They approved our application. Result!"');
  expect(exclamation?.distinctionTask?.answer).toMatch(/pleasure/);
  expect((exclamation as unknown as { meaningGroup?: unknown })?.meaningGroup).toBeUndefined();
  expect(meaning('result', 'To return to the proprietor')?.exampleKind).toBe('reading-note');
  expect(meaning('economic', 'One who manages')?.exampleKind).toBe('reading-note');
});
