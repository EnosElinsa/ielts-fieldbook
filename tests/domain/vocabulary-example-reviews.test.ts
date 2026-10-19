import { expect, test } from 'vitest';
import { buildQualityReport, exportQualityWork } from '../../scripts/vocabulary-quality';

function fixture() {
  const sense = { id: 'river', pos: 'noun', definition: 'Land beside a river.', example: 'a grassy bank', collocations: [], distinctions: [] };
  const source = { entryId: 'bank', term: 'bank', originalSense: sense, displaySense: sense, reviewStatus: 'pending' as const };
  const lesson = { entryId: 'bank', term: 'bank', sense, scope: { kind: 'default' as const }, modes: [] };
  const input = { sources: [source], lessons: [lesson] };
  const item = buildQualityReport(input).work[0];
  const review = { workItemId: item.workItemId, entryId: item.entryId, senseId: item.senseId, sourceHash: item.sourceHash, displayHash: item.displayHash,
    issue: 'example-fragment-signal', decision: 'retain-valid-example', referenceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=123',
    rationale: 'A valid short usage example for this exact riverbank meaning.' };
  return { sense, input, item, review };
}

test('an explicit exact-content review resolves one heuristic while preserving the example and dictionary backlog', () => {
  const { input, sense, review } = fixture(), before = structuredClone(input);
  const report = buildQualityReport({ ...input, exampleReviews: [review] });
  expect(report.work[0]).toMatchObject({ rawSignals: expect.arrayContaining(['example-fragment-signal', 'missing-collocations']),
    resolvedSignals: ['example-fragment-signal'], displaySense: sense, reviewStatus: 'pending' });
  expect(report.work[0].signals).not.toContain('example-fragment-signal');
  expect(report.work[0].signals).toContain('missing-collocations');
  expect(report.summary).toMatchObject({ reviewed: 0, pending: 1, retainedExampleReviews: 1, learningWithReviewSignals: 0 });
  expect(report.byIssue['example-fragment-signal']).toMatchObject({ learning: 0, dictionary: 0 });
  expect(report.rawByIssue['example-fragment-signal']).toMatchObject({ learning: 1, dictionary: 1 });
  expect(exportQualityWork(report, { scope: 'learning', issue: 'example-fragment-signal' }).items).toEqual([]);
  expect(input).toEqual(before);
});

test('same-ID theme teaching does not inherit another definition or example review', () => {
  const { input, review, sense } = fixture();
  const group = { ...input.lessons[0], scope: { kind: 'group' as const, bookId: 'b', unitId: 'finance' },
    sense: { ...sense, definition: 'A financial institution.', example: 'a bank offering loans' } };
  const report = buildQualityReport({ ...input, lessons: [...input.lessons, group], exampleReviews: [review] });
  expect(report.summary.learningVariants).toBe(2);
  expect(report.work.find(row => row.displaySense.definition === group.sense.definition)).toMatchObject({
    rawSignals: expect.arrayContaining(['example-fragment-signal']), signals: expect.arrayContaining(['example-fragment-signal']), resolvedSignals: [] });
});

test.each(['definition', 'example', 'pos', 'collocations'] as const)('a changed %s invalidates the old exact-content review', key => {
  const { input, review, sense } = fixture();
  const changed = { ...sense, [key]: key === 'collocations' ? ['river bank'] : 'changed content' };
  expect(() => buildQualityReport({ ...input, sources: [{ ...input.sources[0], displaySense: changed }],
    lessons: [{ ...input.lessons[0], sense: changed }], exampleReviews: [review] })).toThrow(/stale|unknown/i);
});

test('changed original source data cannot reuse an old review with unchanged displayed text', () => {
  const { input, review, sense } = fixture();
  expect(() => buildQualityReport({ ...input, sources: [{ ...input.sources[0], originalSense: { ...sense, usage: 'A source revision.' } }], exampleReviews: [review] })).toThrow(/source|fingerprint/i);
});

test.each([
  { issue: 'missing-example' }, { decision: 'approved' }, { workItemId: 'unknown' }, { entryId: 'another' }, { senseId: 'another' },
  { displayHash: 'changed' }, { sourceHash: null }, { rationale: '' }, { referenceUrl: 'javascript:alert(1)' },
  { referenceUrl: ['https://example.com'] }, { reviewedAreas: ['definition', 'example'] },
])('unsupported or stale receipt %j cannot suppress a content issue', patch => {
  const { input, review } = fixture();
  expect(() => buildQualityReport({ ...input, exampleReviews: [{ ...review, ...patch }] })).toThrow(/review|source|fingerprint/i);
});

test('duplicate receipts and receipts for an absent signal fail explicitly', () => {
  const { input, review } = fixture();
  expect(() => buildQualityReport({ ...input, exampleReviews: [review, review] })).toThrow(/duplicate/i);
  const sense = { ...input.sources[0].displaySense, example: 'We sat on the bank.' };
  const next = { ...input, sources: [{ ...input.sources[0], displaySense: sense }], lessons: [{ ...input.lessons[0], sense }] };
  const item = buildQualityReport(next).work[0];
  expect(() => buildQualityReport({ ...next, exampleReviews: [{ ...review, workItemId: item.workItemId, displayHash: item.displayHash }] })).toThrow(/signal/i);
});

test('retaining an example cannot hide another content signal or grant editorial approval', () => {
  const { input, review } = fixture();
  const sense = { ...input.sources[0].displaySense, example: 'Thou shalt rest by the bank' };
  const next = { ...input, sources: [{ ...input.sources[0], displaySense: sense }], lessons: [{ ...input.lessons[0], sense }] };
  const item = buildQualityReport(next).work[0];
  const report = buildQualityReport({ ...next, exampleReviews: [{ ...review, workItemId: item.workItemId, displayHash: item.displayHash }] });
  expect(report.work[0].signals).toContain('archaic-example');
  expect(report.summary).toMatchObject({ learningWithReviewSignals: 1, reviewed: 0, pending: 1 });
});
