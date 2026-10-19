import { expect, test } from 'vitest';
import { buildQualityReport, exportQualityWork, validateQualityCandidates } from '../../scripts/vocabulary-quality';

const sense = (id: string, definition = 'Land beside a river.', example = 'We sat on the bank.') => ({ id, definition, example, pos: 'noun', collocations: ['river bank'], distinctions: ['This is land, rather than a financial institution.'] });
const source = (id: string, patch = {}) => ({ entryId: 'bank', term: 'bank', originalSense: sense(id), displaySense: sense(id), reviewStatus: 'pending' as const, ...patch });
const lesson = (id: string, patch = {}) => ({ entryId: 'bank', term: 'bank', sense: sense(id), scope: { kind: 'default' as const }, modes: ['cloze', 'distinction'], ...patch });

test('full reference inventory and usable default coverage are counted separately without semantic approval', () => {
  const report = buildQualityReport({ sources: [source('river'), source('finance', { displaySense: sense('finance', 'An institution holding money.', '') })], lessons: [lesson('river')] });
  expect(report.summary).toMatchObject({ dictionarySenses: 2, reviewed: 0, pending: 2, learningVariants: 1, learningEntries: 1, learningWithExamples: 1 });
  expect(report.work.find(row => row.senseId === 'finance')?.signals).toContain('missing-example');
  expect(report.work.find(row => row.senseId === 'finance')?.scopes).toEqual([]);
  expect(report.work.every(row => row.reviewStatus === 'pending')).toBe(true);
});

test('same-ID group teaching is kept separate when its text differs from a default or another group', () => {
  const report = buildQualityReport({ sources: [source('river')], lessons: [lesson('river'), lesson('river', { sense: sense('river', 'A financial institution.'), scope: { kind: 'group', bookId: 'book', unitId: 'finance' } }), lesson('river', { scope: { kind: 'group', bookId: 'book', unitId: 'geography' } })] });
  expect(report.summary).toMatchObject({ dictionarySenses: 1, learningVariants: 2, learningContexts: 3 });
  const variants = report.work.filter(row => row.senseId === 'river');
  expect(variants).toHaveLength(2);
  expect(variants.find(row => row.displaySense.definition === 'Land beside a river.')?.scopes).toHaveLength(2);
  expect(new Set(variants.map(row => row.workItemId)).size).toBe(2);
  expect(variants.find(row => row.displaySense.definition === 'A financial institution.')?.reviewStatus).toBe('context-review-required');
});

test('duplicate glosses are review signals and retain both identities and original source hashes', () => {
  const input = { sources: [source('river'), source('riverside'), source('other-pos', { originalSense: { ...sense('other-pos'), pos: 'verb' }, displaySense: { ...sense('other-pos'), pos: 'verb' } })], lessons: [] };
  const report = buildQualityReport(input);
  expect(report.summary.duplicateGlossGroups).toBe(1);
  expect(report.work.filter(row => row.signals.includes('duplicate-gloss')).map(row => row.senseId)).toEqual(['river', 'riverside']);
  expect(new Set(report.work.map(row => row.sourceHash)).size).toBe(3);
  expect(input.sources[0].originalSense.id).toBe('river');
});

test('source artefacts and truncated quotes are flagged without declaring a fragment or absent diagram incorrect', () => {
  const report = buildQualityReport({ sources: [source('fragment', { displaySense: sense('fragment', 'A riverside.', 'at the bank') }), source('relation', { displaySense: sense('relation', 'A financial institution.', 'Synonyms: lender') }), source('quote', { displaySense: sense('quote', 'A slope.', 'He hath a bank […]') })], lessons: [] });
  expect(report.work.find(row => row.senseId === 'fragment')?.signals).toEqual(['example-fragment-signal']);
  expect(report.work.find(row => row.senseId === 'relation')?.signals).toContain('relation-example');
  expect(report.work.find(row => row.senseId === 'quote')?.signals).toEqual(expect.arrayContaining(['truncated-example', 'archaic-example']));
  expect(report.work.every(row => !row.signals.some(flag => flag.includes('diagram')))).toBe(true);
});

test('bulk work is stable, prioritises visible gaps and supports bounded issue-specific packages', () => {
  const a = source('reference', { displaySense: sense('reference', 'A slope.', '') });
  const b = source('visible', { displaySense: sense('visible', 'A financial institution.', '') });
  const visible = lesson('visible', { sense: b.displaySense });
  const report = buildQualityReport({ sources: [a, b], lessons: [visible] });
  const reversed = buildQualityReport({ sources: [b, a], lessons: [visible] });
  expect(report).toEqual(reversed);
  const batch = exportQualityWork(report, { scope: 'learning', issue: 'missing-example', limit: 200, offset: 0 });
  expect(batch.items.map(row => row.senseId)).toEqual(['visible']);
  expect(batch.items[0]).toMatchObject({ status: 'candidate-required', originalSense: b.originalSense, displaySense: b.displaySense });
  expect(batch.items[0]).not.toHaveProperty('reviewedAreas');
  expect(() => exportQualityWork(report, { limit: 0 })).toThrow(/limit/i);
  expect(() => exportQualityWork(report, { offset: -1 })).toThrow(/offset/i);
  expect(() => exportQualityWork(report, { issue: 'typo' })).toThrow(/issue/i);
});

test('candidate checks reject stale identities, duplicate tasks and machine-written approval claims', () => {
  const report = buildQualityReport({ sources: [source('river')], lessons: [lesson('river')] });
  const row = report.work[0];
  const candidate = { workItemId: row.workItemId, sourceHash: row.sourceHash, displayHash: row.displayHash, definition: 'Land beside a river.', example: 'We rested on the river bank.', collocations: ['river bank'], distinctions: ['This sense describes land.'], referenceUrl: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=123' };
  expect(validateQualityCandidates(report, [candidate])).toMatchObject({ structurallyValid: 1, readyForPublication: 0, semanticReviewRequired: 1, errors: [] });
  for (const patch of [
    { workItemId: 'unknown' }, { sourceHash: 'stale' }, { displayHash: 'changed' }, { collocations: [] },
    { distinctions: [' '] }, { referenceUrl: 'javascript:alert(1)' }, { referenceUrl: [candidate.referenceUrl] }, { learningPriority: ['general'] }, { reviewedAreas: ['example'] },
    { distinctionTask: { prompt: 'Choose _____.', options: ['bank', ' BANK '], answer: 'bank', explanation: 'A bank.' } },
  ]) expect(validateQualityCandidates(report, [{ ...candidate, ...patch }]).errors.length).toBeGreaterThan(0);
  expect(validateQualityCandidates(report, [candidate, candidate]).errors.join(' ')).toMatch(/duplicate/i);
});

test.each(['Near-synonym: cask', 'Near-synonyms: lender, creditor', 'Coordinate terms: stream, lake'])('source relation %s is a missing displayed example, not usable sentence coverage', example => {
  const displaySense = sense('river', 'A river bank.', example);
  const report = buildQualityReport({ sources: [source('river', { displaySense })], lessons: [lesson('river', { sense: displaySense, modes: [] })] });
  expect(report.summary.learningWithExamples).toBe(0);
  expect(report.work[0].signals).toEqual(expect.arrayContaining(['missing-example', 'relation-example']));
});

test('reading notes and source references do not acquire compulsory example, cloze, distinction or diagram requirements', () => {
  const report = buildQualityReport({ sources: [source('note', { readingNote: true, displaySense: sense('note', 'A historical usage.', 'In this old passage the word refers to a slope') }), source('ref', { referenceOnly: true, displaySense: sense('ref', 'See another entry.', '') })], lessons: [] });
  expect(report.work.find(row => row.senseId === 'note')?.signals).toEqual([]);
  expect(report.work.find(row => row.senseId === 'ref')?.signals).toEqual([]);
  expect(report.summary).toMatchObject({ reviewed: 0, pending: 2 });
});

test('visible content-review signals precede enrichment opportunities without labelling either as semantic approval', () => {
  const enrichment = sense('enrichment', 'A financial service.');
  enrichment.collocations = []; enrichment.distinctions = [];
  const review = sense('review', 'A slope.', 'Thou shalt rest beside the bank.');
  const report = buildQualityReport({ sources: [source('enrichment', { originalSense: enrichment, displaySense: enrichment }), source('review', { originalSense: review, displaySense: review })],
    lessons: [lesson('review', { sense: review }), ...['a', 'b', 'c'].map(unitId => lesson('enrichment', { sense: enrichment, modes: ['cloze'], scope: { kind: 'group', bookId: 'b', unitId } }))] });
  expect(report.work[0].senseId).toBe('review');
  expect(report.summary).toMatchObject({ learningVariants: 2, learningWithReviewSignals: 1, learningWithoutReviewSignals: 1, learningWithEnrichmentSignals: 1, pending: 2, reviewed: 0 });
  expect(report.signalKinds).toMatchObject({ 'archaic-example': 'content-review', 'example-fragment-signal': 'content-review', 'missing-collocations': 'enrichment', 'no-distinction-task': 'enrichment' });
});
