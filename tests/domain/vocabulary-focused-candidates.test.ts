import { expect, test } from 'vitest';
import { buildQualityReport, exportQualityWork, validateQualityCandidates } from '../../scripts/vocabulary-quality';
import { prepareSourceCandidates } from '../../scripts/vocabulary-source-candidates';

function fixture(sparse = false) {
  const sense = { id: 'river', definition: 'Land beside a river.', pos: 'noun', example: 'We rested by the bank.',
    collocations: sparse ? [] : ['river bank'], distinctions: sparse ? [] : ['This is land, rather than a financial institution.'],
    usage: 'Use bank for the land alongside a river.', register: 'general', synonyms: ['riverside'],
    source: 'English Wiktionary', sourceUrl: 'https://en.wiktionary.org/wiki/bank#English', license: 'CC-BY-SA-4.0',
    distinctionTask: { prompt: 'We sat beside the river on its _____.', options: ['bank', 'branch'], answer: 'bank', explanation: 'A bank is the land beside a river.' } };
  const report = buildQualityReport({ sources: [{ entryId: 'bank', term: 'bank', originalSense: sense, displaySense: sense, reviewStatus: 'pending' }],
    lessons: [{ entryId: 'bank', term: 'bank', sense, scope: { kind: 'default' }, modes: ['cloze', 'distinction'] }] });
  const item = report.work[0];
  const candidate = { workItemId: item.workItemId, sourceHash: item.sourceHash, displayHash: item.displayHash,
    referenceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=12345', changes: { example: 'We walked along the river bank.' } };
  return { sense, report, item, candidate };
}
const response = { query: { pages: { '42': { title: 'bank', revisions: [{ revid: 12345, slots: { main: { '*': '==English==\n===Noun===\n# Land beside a river.\n#: {{ux|en|We walked along the river bank.}}' } } }] } } } };

test('an example-only candidate does not require optional teaching fields and previews the preserved content', () => {
  const { report, item, candidate } = fixture(true), before = structuredClone(report);
  const result = validateQualityCandidates(report, [candidate]);
  expect(result).toMatchObject({ structurallyValid: 1, semanticReviewRequired: 1, readyForPublication: 0, errors: [] });
  expect(result.focusedPreviews).toEqual([{ workItemId: item.workItemId, entryId: item.entryId, term: item.term, senseId: item.senseId,
    sourceHash: item.sourceHash, displayHash: item.displayHash, referenceUrl: candidate.referenceUrl, scopes: item.scopes, status: 'semantic-review-required', changedFields: ['example'], reviewFields: ['example'],
    sense: { ...item.displaySense, example: candidate.changes.example }, metadata: { readingNote: false, referenceOnly: false, learningPriority: null } }]);
  expect(report).toEqual(before);
  result.focusedPreviews[0].sense.synonyms!.push('changed preview');
  expect(item.displaySense.synonyms).toEqual(['riverside']);
});

test.each([
  {}, { example: 'We rested by the bank.' }, { example: '' }, { example: 'Example pending' },
  { collocations: [] }, { distinctions: ['bank', ' BANK '] }, { exampleKind: 'sentence' },
  { learningPriority: 'common' }, { learningPriority: ['general'] }, { reviewedAreas: ['example'] }, { id: 'different' },
  { distinctionTask: { prompt: 'Choose _____.', options: ['bank', ' BANK '], answer: 'bank', explanation: 'Land.' } },
])('invalid or ineffective focused changes cannot become a publishable candidate: %j', changes => {
  const { report, candidate } = fixture();
  const result = validateQualityCandidates(report, [{ ...candidate, changes }]);
  expect(result.structurallyValid).toBe(0);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.focusedPreviews).toEqual([]);
  expect(result.readyForPublication).toBe(0);
});

test('focused candidates retain stale, duplicate, source and root-field protection', () => {
  const { report, candidate } = fixture();
  for (const patch of [{ sourceHash: 'stale' }, { displayHash: 'stale' }, { workItemId: 'other' },
    { referenceUrl: 'javascript:alert(1)' }, { referenceUrl: [candidate.referenceUrl] }, { example: 'Ambiguous second example.' }, { reviewedAreas: ['example'] }, { changes: null }]) {
    expect(validateQualityCandidates(report, [{ ...candidate, ...patch }]).errors.length).toBeGreaterThan(0);
  }
  expect(validateQualityCandidates(report, [candidate, candidate]).errors.join(' ')).toMatch(/duplicate/i);
});

test('a changed definition preserves existing material for explicit review instead of silently approving it', () => {
  const { report, item, candidate } = fixture();
  const result = validateQualityCandidates(report, [{ ...candidate, changes: { definition: 'Ground along the edge of a river.' } }]);
  expect(result.errors).toEqual([]);
  const preview = result.focusedPreviews[0];
  expect(preview.changedFields).toEqual(['definition']);
  expect(preview.reviewFields).toEqual(expect.arrayContaining(['definition', 'pos', 'example', 'collocations', 'distinctions', 'distinctionTask', 'learningPriority', 'diagram', 'pronunciation']));
  expect(preview.sense.example).toBe(item.displaySense.example);
  expect(preview.sense.distinctionTask).toEqual(item.displaySense.distinctionTask);
  expect(result.readyForPublication).toBe(0);
});

test('editorial metadata remains separate from the sense snapshot', () => {
  const { report, candidate } = fixture();
  const result = validateQualityCandidates(report, [{ ...candidate, changes: { exampleKind: 'reading-note', learningPriority: 'historical' } }]);
  expect(result.errors).toEqual([]);
  expect(result.focusedPreviews[0].metadata).toEqual({ readingNote: true, referenceOnly: false, learningPriority: 'historical' });
  expect(result.focusedPreviews[0].sense).not.toHaveProperty('exampleKind');
  expect(result.focusedPreviews[0].sense).not.toHaveProperty('learningPriority');
});

test('a same-ID course meaning retains its own scope and cannot patch another teaching variant', () => {
  const { sense } = fixture();
  const groupSense = { ...sense, definition: 'A financial institution.', example: 'The bank approved her loan.' };
  const report = buildQualityReport({ sources: [{ entryId: 'bank', term: 'bank', originalSense: sense, displaySense: sense, reviewStatus: 'pending' }],
    lessons: [{ entryId: 'bank', term: 'bank', sense, scope: { kind: 'default' }, modes: [] },
      { entryId: 'bank', term: 'bank', sense: groupSense, scope: { kind: 'group', bookId: 'finance', unitId: 'lending' }, modes: [] }] });
  const item = report.work.find(row => row.reviewStatus === 'context-review-required')!;
  const candidate = { workItemId: item.workItemId, sourceHash: item.sourceHash, displayHash: item.displayHash,
    referenceUrl: sense.sourceUrl, changes: { example: 'She deposited her savings at the bank.' } };
  const result = validateQualityCandidates(report, [candidate]);
  expect(result.errors).toEqual([]);
  expect(result.focusedPreviews[0]).toMatchObject({ scopes: [{ kind: 'group', bookId: 'finance', unitId: 'lending' }], sense: { definition: groupSense.definition, example: candidate.changes.example } });
  const original = report.work.find(row => row.scopes.some(scope => scope.kind === 'default'))!;
  expect(original.displaySense.example).toBe(sense.example);
  expect(validateQualityCandidates(report, [{ ...candidate, workItemId: original.workItemId }]).structurallyValid).toBe(0);
});

test('a focused draft requests only the chosen fields and can enter the same candidate validator', () => {
  const { report, item } = fixture(true), before = structuredClone(report);
  const result = prepareSourceCandidates(report, exportQualityWork(report).items, [response], { fields: ['example'] });
  expect(result.requestedFields).toEqual(['example']);
  expect(result.items[0]).toMatchObject({ status: 'semantic-review-required', missingFields: [], draft: { workItemId: item.workItemId,
    sourceHash: item.sourceHash, displayHash: item.displayHash, referenceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=12345',
    changes: { example: 'We walked along the river bank.' } } });
  expect(result.items[0]).toMatchObject({ currentSense: item.displaySense, originalSense: item.originalSense,
    metadata: { readingNote: false, referenceOnly: false, learningPriority: null } });
  result.items[0].currentSense.synonyms!.push('independent authoring copy');
  expect(item.displaySense.synonyms).toEqual(['riverside']);
  expect(result.items[0].draft).not.toHaveProperty('collocations');
  expect(result.items[0].draft).not.toHaveProperty('definition');
  expect(validateQualityCandidates(report, [result.items[0].draft])).toMatchObject({ structurallyValid: 1, readyForPublication: 0, errors: [] });
  expect(report).toEqual(before);
});

test('missing or ambiguous source evidence leaves a focused example unresolved', () => {
  const { report, item } = fixture(true);
  const output = prepareSourceCandidates(report, [item], [], { fields: ['example'] });
  expect(output.items[0]).toMatchObject({ status: 'manual-source-match-required', missingFields: ['example'], draft: { changes: { example: '' } } });
  expect(validateQualityCandidates(report, [output.items[0].draft]).structurallyValid).toBe(0);
});

test('focused authoring rejects unknown, duplicate and empty field selections and preserves existing arrays', () => {
  const { report, item } = fixture();
  for (const fields of [[], ['example', 'example'], ['reviewedAreas']]) {
    expect(() => prepareSourceCandidates(report, [item], [response], { fields })).toThrow(/fields/i);
  }
  const output = prepareSourceCandidates(report, [item], [response], { fields: ['collocations', 'distinctions'] });
  expect(output.items[0].missingFields).toEqual([]);
  expect(output.items[0].unchangedFields).toEqual(['collocations', 'distinctions']);
  expect(validateQualityCandidates(report, [output.items[0].draft]).structurallyValid).toBe(0);
  (output.items[0].draft.changes as { collocations: string[] }).collocations.push('a steep bank');
  expect(item.displaySense.collocations).toEqual(['river bank']);
});
