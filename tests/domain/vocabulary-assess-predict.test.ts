import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
const terms = ['assess', 'evaluate', 'calculate', 'predict'];
const records = ledger.records.filter(row => terms.includes(row.term));
const rows = corrections.filter(row => records.some(record => record.entryId === row.entryId && record.senseId === row.senseId));
const meaning = (term: string, start: string) => rows.find(row => row.entryId === records.find(record => record.term === term)?.entryId && row.originalSense.definition.startsWith(start));

test('all seventeen original meanings receive independent reviews without duplicate restored records', () => {
  expect(records).toHaveLength(17);
  expect(rows).toHaveLength(17);
  expect(sources.filter(row => terms.includes(row.term))).toEqual([]);
  for (const row of rows) {
    expect(row.example.trim()).not.toBe('');
    expect(row.collocations.length).toBeGreaterThan(0);
    expect(row.distinctions.length).toBeGreaterThan(0);
    expect(row.referenceUrl).toMatch(/oldid=\d+$/);
  }
});

test('assessing a charge or tax does not assert completed payment', () => {
  const charge = meaning('assess', 'To impose');
  const tax = meaning('assess', 'To calculate and demand');
  expect(charge?.distinctionTask?.answer).toMatch(/imposed.*payment.*not established/i);
  expect(tax?.distinctions.join(' ')).toMatch(/does not establish.*paid/i);
});

test('expression evaluation provides inputs and separates transitive and intransitive grammar', () => {
  expect(meaning('evaluate', 'To compute')?.example).toBe('We evaluate 4 × (3 + 2) to obtain 20.');
  expect(meaning('evaluate', 'To return')?.example).toBe('With x = 3, the expression 4 × (x + 2) evaluates to 20.');
  expect(meaning('evaluate', 'To return')?.distinctionTask?.answer).toBe('to 20');
});

test('purpose and chess remain usable meanings while dialect explanations stay out of gaps', () => {
  expect(meaning('calculate', 'To adjust for purpose')?.example).toBe('The changes are calculated to reduce waste.');
  expect(meaning('calculate', 'To adjust for purpose')?.distinctionTask?.answer).toMatch(/designed or arranged/);
  expect(meaning('calculate', 'To imagine sequences')?.distinctions.join(' ')).toMatch(/without moving/);
  expect(meaning('calculate', 'To plan; to expect')?.exampleKind).toBe('reading-note');
});

test('model predictions remain conditional and rare or obsolete meanings remain reading explanations', () => {
  const model = meaning('predict', 'To imply');
  expect(model?.example).toBe('For x = 3, the model y = 2x predicts y = 6.');
  expect(model?.distinctionTask?.answer).toBe('what follows within the stated model');
  expect(meaning('predict', 'To direct a ranged')?.exampleKind).toBe('reading-note');
  expect(meaning('predict', 'A prediction.')?.exampleKind).toBe('reading-note');
  expect(rows.filter(row => row.exampleKind === 'reading-note')).toHaveLength(3);
});
