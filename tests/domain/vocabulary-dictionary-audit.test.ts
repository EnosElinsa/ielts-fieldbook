import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
// @ts-expect-error The audit is also an executable ES module.
import { inspectDictionaryReview } from '../../scripts/audit-vocabulary-dictionary.mjs';
const original = { id: 'river', pos: 'noun', definition: 'Land beside a river.', example: '' };
const row = { entryId: 'bank', senseId: 'river', originalSense: original, definition: 'Land along a river.', example: 'We sat on the river bank.', collocations: ['river bank'], distinctions: ['Shore is usual beside a sea.'] };
const review = { term: 'bank', entryId: 'bank', senseId: 'river', sourceHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'), reviewedAreas: ['definition','example','collocations','distinctions'] };
const input = { entries: [{ id: 'bank', term: 'bank' }], dictionaries: { bank: { senses: [original] } }, corrections: [row], records: [review], diagrams: [] };

test('explicit reading-note metadata is counted and unknown example types fail review', () => {
  const result = inspectDictionaryReview({ ...input, corrections: [{ ...row, exampleKind: 'reading-note' }] });
  expect(result.errors).toEqual([]);
  expect(result.summary.readingNotes).toBe(1);
  const invalid = inspectDictionaryReview({ ...input, corrections: [{ ...row, exampleKind: 'guessed-from-text' }] });
  expect(invalid.errors.join(' ')).toMatch(/example kind/i);
  expect(invalid.summary.reviewed).toBe(0);
});

test('distinction options cannot differ only in case under case-insensitive scoring', () => {
  const distinctionTask = { prompt: 'Choose _____.', options: ['AB', 'Ab'], answer: 'AB', explanation: 'The uppercase string is required.' };
  expect(inspectDictionaryReview({ ...input, corrections: [{ ...row, distinctionTask }] }).errors.join(' ')).toMatch(/distinction task/i);
});

test('review accounting reconciles every source sense and flags changed source fingerprints', () => {
  const valid = inspectDictionaryReview(input);
  expect(valid.summary).toMatchObject({ terms: 1, senses: 1, reviewed: 1, pending: 0 });
  expect(valid.errors).toEqual([]);
  const changed = inspectDictionaryReview({ ...input, dictionaries: { bank: { senses: [{ ...original, definition: 'Changed source meaning.' }] } } });
  expect(changed.errors.join(' ')).toMatch(/source hash/i);
  expect(changed.summary.reviewed).toBe(0);
});

test('orphaned identities, duplicate reviews and mismatched diagrams fail the audit', () => {
  const result = inspectDictionaryReview({ ...input, records: [review, review, { ...review, senseId: 'absent' }], diagrams: [{ entryId: 'bank', senseId: 'river', term: 'bank', pos: 'noun', definition: 'A financial institution.', kind: 'financial-bank' }] });
  expect(result.errors.join(' ')).toMatch(/duplicate/i);
  expect(result.errors.join(' ')).toMatch(/source sense/i);
  expect(result.errors.join(' ')).toMatch(/diagram/i);
});

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('spelling references require a source spelling-error record and cannot contain an exercise', () => {
  expect(inspectDictionaryReview({ ...input, corrections: [{ ...row, referenceOnly: true }] }).errors.join(' ')).toMatch(/spelling reference/i);
  const source = { ...original, definition: 'Misspelling of another word.', usage: 'misspelling' };
  const referenceInput = { ...input, dictionaries: { bank: { senses: [source] } }, records: [{ ...review, sourceHash: hash(source) }], corrections: [{ ...row, originalSense: source, referenceOnly: true }] };
  expect(inspectDictionaryReview(referenceInput).summary.spellingReferences).toBe(1);
  expect(inspectDictionaryReview(referenceInput).errors).toEqual([]);
  expect(inspectDictionaryReview({ ...referenceInput, corrections: [{ ...referenceInput.corrections[0], distinctionTask: { prompt: 'Choose _____.', options: ['a','b'], answer: 'a', explanation: 'A task.' } }] }).errors.join(' ')).toMatch(/spelling reference/i);
});
const restored = { id: 'restored', pos: 'noun', definition: 'A river edge.', example: '', sourceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=123', source: 'English Wiktionary, restored submeaning', license: 'CC-BY-SA-4.0', attribution: 'English Wiktionary contributors' };
const evidence = { term: 'bank', entryId: 'bank', parentSenseId: original.id, parentSourceHash: hash(original), revision: 123, sourcePage: 'bank', sourceGloss: '## A river edge.', sense: restored };
const restoredInput = { ...input, restoredSources: [evidence], corrections: [...input.corrections, { ...row, senseId: restored.id, originalSense: restored, dictionaryParentSenseId: original.id }], records: [...input.records, { ...review, senseId: restored.id, sourceHash: hash(restored) }] };

test('restored evidence preserves the exact capitalised source page of its parent', () => {
  const parent = { ...original, sourceUrl: 'https://en.wiktionary.org/wiki/Bank#English' };
  const child = { ...restored, sourceUrl: 'https://en.wiktionary.org/w/index.php?title=Bank&oldid=123' };
  const data = { ...input, dictionaries: { bank: { senses: [parent] } }, restoredSources: [{ ...evidence, sourcePage: 'Bank', parentSourceHash: hash(parent), sense: child }], corrections: [{ ...row, originalSense: parent }, { ...row, senseId: child.id, originalSense: child, dictionaryParentSenseId: parent.id }], records: [{ ...review, sourceHash: hash(parent) }, { ...review, senseId: child.id, sourceHash: hash(child) }] };
  expect(inspectDictionaryReview(data).errors).toEqual([]);
  expect(inspectDictionaryReview({ ...data, restoredSources: [{ ...data.restoredSources[0], sourcePage: 'bank', sense: { ...child, sourceUrl: restored.sourceUrl } }] }).errors.join(' ')).toMatch(/entry identity/i);
});

test('a geographic place heading and independently restored place preserve their rendered source meanings', () => {
  const parent = { ...original, definition: 'A place in the United States:', sourceUrl: 'https://en.wiktionary.org/wiki/Bank#English' };
  const child = { ...restored, definition: 'An unincorporated community in Garland County, Arkansas.', sourceUrl: 'https://en.wiktionary.org/w/index.php?title=Bank&oldid=123' };
  const grouping = { ...row, originalSense: parent, referenceUrl: child.sourceUrl, meaningGroup: { sourceGloss: '# {{place|en|place|c/USA}}:' } };
  const childEvidence = { ...evidence, sourcePage: 'Bank', parentSourceHash: hash(parent), sourceGloss: '## {{place|en|ucomm|co/Garland County|s/Arkansas}}.', sense: child };
  const data = { ...input, dictionaries: { bank: { senses: [parent] } }, restoredSources: [childEvidence], corrections: [grouping, { ...row, senseId: child.id, originalSense: child, dictionaryParentSenseId: parent.id }], records: [{ ...review, sourceHash: hash(parent) }, { ...review, senseId: child.id, sourceHash: hash(child) }] };
  expect(inspectDictionaryReview(data).errors).toEqual([]);
  expect(inspectDictionaryReview(data).summary.meaningGroups).toBe(1);
  expect(inspectDictionaryReview({ ...data, restoredSources: [{ ...childEvidence, sourceGloss: '## {{place|en|ucomm|co/Adams County|s/Idaho}}.' }] }).errors.join(' ')).toMatch(/gloss/i);
  expect(inspectDictionaryReview({ ...data, corrections: [{ ...grouping, meaningGroup: { sourceGloss: '# {{place|en|city|c/USA}}:' } }, data.corrections[1]] }).errors.join(' ')).toMatch(/meaning group/i);
});

test('a source grouping needs a non-gloss heading, independently bound children and no exercise', () => {
  const grouping = { ...row, referenceUrl: restored.sourceUrl, meaningGroup: { sourceGloss: '# {{ng|Land beside a river.}}' } };
  const groupedInput = { ...restoredInput, corrections: [grouping, restoredInput.corrections[1]] };
  const valid = inspectDictionaryReview(groupedInput);
  expect(valid.errors).toEqual([]);
  expect(valid.summary.meaningGroups).toBe(1);
  for (const patch of [
    { restoredSources: [], corrections: [grouping], records: [review] },
    { corrections: [{ ...grouping, meaningGroup: { sourceGloss: '# A lexical definition.' } }, restoredInput.corrections[1]] },
    { corrections: [{ ...grouping, distinctionTask: { prompt: 'Choose _____.', options: ['a', 'b'], answer: 'a', explanation: 'A question.' } }, restoredInput.corrections[1]] },
  ]) expect(inspectDictionaryReview({ ...groupedInput, ...patch }).errors.join(' ')).toMatch(/meaning group/i);
});

test('an explicitly labelled source heading also needs independently bound children', () => {
  const grouping = { ...row, referenceUrl: restored.sourceUrl, meaningGroup: { sourceGloss: "# {{lb|en|heading|transitive}} ''Land beside a river.''" } };
  expect(inspectDictionaryReview({ ...restoredInput, corrections: [grouping, restoredInput.corrections[1]] }).errors).toEqual([]);
  expect(inspectDictionaryReview({ ...input, corrections: [grouping] }).errors.join(' ')).toMatch(/meaning group/i);
});

test('a phrasal-verb usage reference needs exact source wording and a revision, with no exercise', () => {
  const source = { ...original, definition: 'Used in phrasal verbs: lead off, lead on.' };
  const reference = { ...row, originalSense: source, referenceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=123', usageReference: { sourceGloss: '# {{used in phrasal verbs|lead off|lead on|lang=en}}' } };
  const value = { ...input, dictionaries: { bank: { senses: [source] } }, records: [{ ...review, sourceHash: hash(source) }], corrections: [reference] };
  expect(inspectDictionaryReview(value).errors).toEqual([]);
  expect(inspectDictionaryReview(value).summary.usageReferences).toBe(1);
  for (const patch of [{ referenceUrl: 'https://en.wiktionary.org/wiki/bank' }, { usageReference: { sourceGloss: '# {{used in phrasal verbs|made up|lang=en}}' } }, { referenceOnly: true }, { distinctionTask: { prompt: 'Choose _____.', options: ['a','b'], answer: 'a', explanation: 'A task.' } }]) {
    expect(inspectDictionaryReview({ ...value, corrections: [{ ...reference, ...patch }] }).errors.join(' ')).toMatch(/usage reference/i);
  }
});

test('restored submeanings require independent revision evidence and preserve raw counts', () => {
  const valid = inspectDictionaryReview(restoredInput);
  expect(valid.errors).toEqual([]);
  expect(valid.summary).toMatchObject({ senses: 2, preservedSenses: 1, restoredSenses: 1, reviewed: 2, pending: 0, rawMissingExamples: 1 });
  for (const patch of [{ parentSourceHash: 'changed' }, { parentSenseId: 'absent' }, { entryId: 'another-entry' }, { revision: 124 }, { sense: { ...restored, id: original.id } }, { sourceGloss: 'not a definition line' }]) {
    expect(inspectDictionaryReview({ ...restoredInput, restoredSources: [{ ...evidence, ...patch }] }).errors.length).toBeGreaterThan(0);
  }
  expect(inspectDictionaryReview({ ...restoredInput, restoredSources: [] }).errors.join(' ')).toMatch(/restored|source sense/i);
  expect(inspectDictionaryReview({ ...restoredInput, corrections: [...input.corrections, { ...restoredInput.corrections[1], dictionaryParentSenseId: 'other-parent' }] }).errors.join(' ')).toMatch(/parent/i);
});

test('source comments remain in evidence without becoming part of the displayed definition', () => {
  const sourceGloss = '## A [[river]] <!-- editorial note\nwith [[markup]] --> edge.';
  const result = inspectDictionaryReview({ ...restoredInput, restoredSources: [{ ...evidence, sourceGloss }] });
  expect(result.errors).toEqual([]);
  expect(result.summary.reviewed).toBe(2);
  expect(sourceGloss).toContain('<!-- editorial note');
  const changed = inspectDictionaryReview({ ...restoredInput, restoredSources: [{ ...evidence, sourceGloss: '## A [[different]] <!-- comment --> edge.' }] });
  expect(changed.errors.join(' ')).toMatch(/gloss/i);
});

test('non-gloss definition templates retain their explanatory text in restored evidence', () => {
  const sourceGloss = '## {{n-g|A [[river]] edge.}}';
  const valid = inspectDictionaryReview({ ...restoredInput, restoredSources: [{ ...evidence, sourceGloss }] });
  expect(valid.errors).toEqual([]);
  expect(valid.summary.reviewed).toBe(2);
  const changed = inspectDictionaryReview({ ...restoredInput, restoredSources: [{ ...evidence, sourceGloss: '## {{n-g|A [[different]] edge.}}' }] });
  expect(changed.errors.join(' ')).toMatch(/gloss/i);
});
