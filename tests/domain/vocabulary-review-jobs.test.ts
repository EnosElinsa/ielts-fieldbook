import { expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildQualityReport } from '../../scripts/vocabulary-quality';
import { claimReviewPackage, createReviewJobs, reviewAreas, transitionReviewTerm, verifyReviewManifest } from '../../scripts/vocabulary-review-jobs';
import { currentQualitySourceSnapshot, runReviewJobsCli } from '../../scripts/manage-vocabulary-review-jobs';

const snapshot = 'a'.repeat(64);
function fixture() {
  const sense = (id: string, definition = 'A meaning.') => ({ id, pos: 'noun', definition, example: 'This is an example.' });
  const sources = [
    { entryId: 'old', term: 'old', originalSense: sense('o1'), displaySense: sense('o1'), reviewStatus: 'pending' as const, priority: 'historical' },
    { entryId: 'bank', term: 'bank', originalSense: sense('b1'), displaySense: sense('b1'), reviewStatus: 'pending' as const },
    { entryId: 'bank', term: 'bank', originalSense: sense('restored-child'), displaySense: sense('restored-child'), reviewStatus: 'pending' as const },
    { entryId: 'bank', term: 'bank', originalSense: sense('b2'), displaySense: sense('b2'), reviewStatus: 'reviewed' as const },
    ...Array.from({ length: 4 }, (_, i) => ({ entryId: 'large', term: 'large', originalSense: sense('l' + i), displaySense: sense('l' + i), reviewStatus: 'pending' as const })),
  ];
  const lessons = [{ entryId: 'bank', term: 'bank', sense: sense('b1', 'A topic-specific meaning.'), scope: { kind: 'group' as const, bookId: 'book', unitId: 'unit' }, modes: [] }];
  return { ...buildQualityReport({ sources, lessons }), sourceSnapshot: snapshot };
}

test('whole terms keep reviewed, restored and teaching variants while learning terms lead and oversized terms stand alone', () => {
  const report = fixture(), before = structuredClone(report);
  const job = createReviewJobs(report, { targetPendingSenses: 3 });
  expect(job.manifest.packages.map(row => row.terms)).toEqual([['bank', 'old'], ['large']]);
  expect(job.manifest.packages.map(row => row.pendingSenses)).toEqual([3, 4]);
  const bank = job.packages[0].terms[0];
  expect(bank.items).toHaveLength(4);
  expect(bank.items.map(row => row.senseId).sort()).toEqual(['b1', 'b1', 'b2', 'restored-child']);
  expect(bank.items.find(row => row.reviewStatus === 'context-review-required')?.scopes).toEqual([{ kind: 'group', bookId: 'book', unitId: 'unit' }]);
  expect(job.manifest.summary).toMatchObject({ terms: 3, sourceSenses: 8, pendingSenses: 7, workItems: 9 });
  expect(report).toEqual(before);
});

test('default packages target 300 pending senses and never split a term at the boundary', () => {
  const base = fixture();
  const report = { ...base, summary: { ...base.summary, dictionarySenses: 301, pending: 301, reviewed: 0 }, work: Array.from({ length: 301 }, (_, i) => ({ ...base.work[0], term: 'term-' + String(i).padStart(3, '0'), entryId: 'e' + i, senseId: 's' + i, workItemId: 'work-' + i, scopes: [], reviewStatus: 'pending' as const })) };
  expect(createReviewJobs(report).manifest.packages.map(row => row.pendingSenses)).toEqual([300, 1]);
});

test('reordered report rows keep fingerprints but changed source, displayed content, scope or inventory invalidate a job', () => {
  const report = fixture(), manifest = createReviewJobs(report).manifest;
  expect(() => verifyReviewManifest(manifest, { ...report, work: [...report.work].reverse() })).not.toThrow();
  for (const changed of [
    { ...report, sourceSnapshot: 'b'.repeat(64) },
    { ...report, work: report.work.slice(1) },
    { ...report, work: report.work.map((row, i) => i ? row : { ...row, displayHash: 'changed' }) },
    { ...report, work: report.work.map((row, i) => i ? row : { ...row, scopes: [{ kind: 'default' as const }] }) },
  ]) expect(() => verifyReviewManifest(manifest, changed)).toThrow(/stale|fingerprint|snapshot/i);
});

test('package claims are exclusive and malformed manifests cannot assign the same term twice', () => {
  const report = fixture(), manifest = createReviewJobs(report, { targetPendingSenses: 3 }).manifest;
  const claimed = claimReviewPackage(manifest, report, manifest.packages[0].id, 'author');
  expect(claimed.terms.filter(row => row.owner === 'author').map(row => row.term)).toEqual(['bank', 'old']);
  expect(manifest.terms.every(row => row.owner === null)).toBe(true);
  expect(() => claimReviewPackage(claimed, report, manifest.packages[0].id, 'other')).toThrow(/claim|owner/i);
  const duplicate = structuredClone(manifest);
  duplicate.packages[1].terms.push('bank');
  expect(() => verifyReviewManifest(duplicate, report)).toThrow(/duplicate|fingerprint/i);
});

test('field candidates remain drafts, reject duplicates and cannot advance through skipped or unresolved review states', () => {
  const report = fixture(), manifest = createReviewJobs(report).manifest;
  const claimed = claimReviewPackage(manifest, report, manifest.packages[0].id, 'author');
  const item = report.work.find(row => row.term === 'bank')!;
  const candidate = { workItemId: item.workItemId, sourceHash: item.sourceHash, displayHash: item.displayHash, referenceUrl: 'https://en.wiktionary.org/wiki/bank', changes: { example: 'The bank is beside the river.' } };
  const common = { term: 'bank', actor: 'author', workFingerprint: claimed.terms.find(row => row.term === 'bank')!.workFingerprint };
  const draft = transitionReviewTerm(claimed, report, { ...common, to: 'draft', candidates: [candidate] });
  expect(draft.terms.find(row => row.term === 'bank')).toMatchObject({ stage: 'draft', candidates: [{ kind: 'field-repair' }] });
  expect(() => transitionReviewTerm(draft, report, { ...common, to: 'draft', candidates: [candidate] })).toThrow(/duplicate/i);
  expect(() => transitionReviewTerm(draft, report, { ...common, workFingerprint: 'stale', to: 'source-unresolved', reason: 'Missing evidence.' })).toThrow(/stale|fingerprint/i);
  expect(() => transitionReviewTerm(claimed, report, { ...common, to: 'integrated', integrationReference: 'change-1' })).toThrow(/transition/i);
  const unresolved = transitionReviewTerm(draft, report, { ...common, to: 'source-unresolved', reason: 'Source identity is ambiguous.' });
  expect(() => transitionReviewTerm(unresolved, report, { ...common, actor: 'reviewer', to: 'checked' })).toThrow(/transition|unresolved/i);
});

test('checked requires independent review of every exact variant and binds retained or changed dispositions to candidates', () => {
  const report = fixture(), initial = createReviewJobs(report).manifest;
  const claimed = claimReviewPackage(initial, report, initial.packages[0].id, 'author');
  const term = claimed.terms.find(row => row.term === 'bank')!;
  const common = { term: 'bank', actor: 'author', workFingerprint: term.workFingerprint };
  const draft = transitionReviewTerm(claimed, report, { ...common, to: 'draft' });
  const reviews = term.work.map(row => ({ workItemId: row.workItemId, workFingerprint: row.workFingerprint, decision: 'retain' as const, reviewedAreas: [...reviewAreas], referenceUrl: 'https://en.wiktionary.org/wiki/bank', rationale: 'The complete exact meaning and existing teaching were checked.' }));
  expect(() => transitionReviewTerm(draft, report, { ...common, to: 'checked', reviews })).toThrow(/independent/i);
  expect(() => transitionReviewTerm(draft, report, { ...common, actor: 'reviewer', to: 'checked', reviews: reviews.slice(1) })).toThrow(/complete|every|coverage/i);
  expect(() => transitionReviewTerm(draft, report, { ...common, actor: 'reviewer', to: 'checked', reviews: reviews.map(row => ({ ...row, reviewedAreas: ['example'] })) })).toThrow(/area|complete/i);
  const checked = transitionReviewTerm(draft, report, { ...common, actor: 'reviewer', to: 'checked', reviews });
  expect(checked.terms.find(row => row.term === 'bank')).toMatchObject({ stage: 'checked', review: { reviewer: 'reviewer' } });
  const integrated = transitionReviewTerm(checked, report, { ...common, to: 'integrated', integrationReference: 'local/reviewed-change.json' });
  expect(integrated.terms.find(row => row.term === 'bank')?.stage).toBe('integrated');
  expect(() => transitionReviewTerm(integrated, report, { ...common, to: 'draft' })).toThrow(/transition/i);
});

test('CLI creates only local packages, preserves author files and serializes claims with an exclusive lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vocabulary-review-jobs-'));
  const write = (file: string, value: string) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  try {
    for (const file of ['public/vocabulary-catalog.json', 'scripts/vocabulary-quality.ts', 'scripts/audit-vocabulary-quality.ts', 'scripts/audit-vocabulary-dictionary.mjs', 'src/domain/vocabulary/content.ts']) write(file, '{}');
    write('public/dictionary/index.json', '{}');
    const report = { ...fixture(), sourceSnapshot: currentQualitySourceSnapshot(root) };
    write('local/report.json', JSON.stringify(report));
    runReviewJobsCli(['create', '--report', 'local/report.json', '--output', 'local/job'], root);
    const manifestPath = path.join(root, 'local/job/manifest.json');
    const before = fs.readFileSync(manifestPath, 'utf8');
    expect(fs.existsSync(path.join(root, 'local/job/review-0001.json'))).toBe(true);
    expect(() => runReviewJobsCli(['create', '--report', 'local/report.json', '--output', 'local/job'], root)).toThrow(/empty|existing/i);
    expect(() => runReviewJobsCli(['create', '--report', 'local/report.json', '--output', 'public/job'], root)).toThrow(/local/i);
    write('local/job/manifest.json.lock', 'another writer');
    expect(() => runReviewJobsCli(['claim', '--manifest', 'local/job/manifest.json', '--package', 'review-0001', '--actor', 'author'], root)).toThrow(/lock|busy|exist/i);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(before);
    fs.unlinkSync(manifestPath + '.lock');
    runReviewJobsCli(['claim', '--manifest', 'local/job/manifest.json', '--package', 'review-0001', '--actor', 'author'], root);
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).terms.every((row: { owner: string }) => row.owner === 'author')).toBe(true);
    expect(fs.existsSync(manifestPath + '.lock')).toBe(false);
    write('src/domain/vocabulary/content.ts', 'changed');
    expect(() => runReviewJobsCli(['verify', '--manifest', 'local/job/manifest.json'], root)).toThrow(/snapshot|stale/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
