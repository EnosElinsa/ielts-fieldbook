import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
const terms = ['reason', 'cause', 'purpose', 'aim'];
const records = ledger.records.filter(row => terms.includes(row.term));
const rows = corrections.filter(row => records.some(record => record.entryId === row.entryId && record.senseId === row.senseId));
const meaning = (term: string, start: string) => rows.find(row => row.entryId === records.find(record => record.term === term)?.entryId && row.originalSense.definition.startsWith(start));

test('the four terms retain all source identities and independently restore the four reason children', () => {
  expect(records).toHaveLength(56);
  expect(rows).toHaveLength(56);
  const restored = sources.filter(row => terms.includes(row.term));
  expect(restored).toHaveLength(4);
  expect(restored.every(row => row.term === 'reason')).toBe(true);
  expect(new Set(restored.map(row => row.parentSenseId)).size).toBe(1);
  expect(meaning('reason', 'A cause:')).not.toHaveProperty('meaningGroup');
});

test('reason retains causal and offered-explanation meanings without treating an explanation as verified', () => {
  expect(meaning('reason', 'A cause:')?.distinctions.join(' ')).toMatch(/can name a cause/);
  expect(rows.find(row => row.definition.startsWith('An explanation or excuse'))?.distinctionTask?.answer).toMatch(/truth is still open/);
  expect(rows.find(row => row.definition.startsWith('A motive for'))?.distinctionTask?.answer).toMatch(/without proving/);
});

test('the logical reason is a scoped reading explanation and the building reason is structural timber', () => {
  const logic = rows.find(row => row.definition.startsWith('In the source’s logical'));
  expect(logic?.exampleKind).toBe('reading-note');
  expect(logic?.distinctions.join(' ')).toMatch(/does not claim that every reason must follow/);
  const timber = meaning('reason', 'A wall plate.');
  expect(timber?.definition).toMatch(/horizontal supporting timber/);
  expect(timber?.distinctions.join(' ')).toMatch(/not an electrical switch cover/);
});

test('cause distinguishes event source, grounds for a response and the two-object verb construction', () => {
  expect(meaning('cause', 'Sufficient reason.')?.distinctionTask?.answer).toBe('for');
  expect(meaning('cause', 'To actively produce')?.distinctionTask?.answer).toBe('inconvenience');
  expect(meaning('cause', 'The source of')?.distinctions.join(' ')).toMatch(/mere correlation/);
});

test('the informal because alias remains usable and is not a spelling reference', () => {
  const alias = meaning('cause', "Alternative form of 'cause");
  expect(alias?.example).toBe('I stayed home cause I was tired.');
  expect(alias?.distinctionTask?.answer).toBe('because');
  expect(alias).not.toHaveProperty('referenceOnly');
});

test('purpose and aim keep intention separate from achievement and everyday aim is the default', () => {
  expect(meaning('purpose', 'The end for which')?.distinctionTask?.answer).toMatch(/without guaranteeing/);
  expect(meaning('aim', 'To direct the intention')?.distinctionTask?.answer).toMatch(/without guaranteeing/);
  expect(meaning('aim', 'Intention or goal.')?.distinctionTask?.answer).toBe('of');
  const aimId = records.find(row => row.term === 'aim')?.entryId;
  expect(defaults.find(row => row.entryId === aimId)?.sense.definition).toBe('An intention or goal.');
});

test('AIM names keep their distinct identities and preserve historical and formerly qualifications', () => {
  expect(meaning('aim', 'Initialism of Asteroid')?.learningPriority).toBe('proper-name');
  expect(meaning('aim', 'Initialism of Aeronomy')?.learningPriority).toBe('proper-name');
  expect(meaning('aim', 'AIM, the secondary')?.definition).toMatch(/formerly/);
  expect(meaning('aim', 'Initialism of AOL')?.example).toMatch(/1997 to 2017/);
  expect(meaning('aim', 'To talk to')?.exampleKind).toBe('reading-note');
  expect(rows.filter(row => row.exampleKind === 'reading-note')).toHaveLength(26);
});
