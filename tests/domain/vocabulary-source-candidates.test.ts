import { expect, test } from 'vitest';
import { buildQualityReport, exportQualityWork } from '../../scripts/vocabulary-quality';
import { prepareSourceCandidates, prepareSourceQueue } from '../../scripts/vocabulary-source-candidates';

const sense = { id: 'river', definition: 'Land beside a river.', example: 'Old text […]', pos: 'noun', sourceUrl: 'https://en.wiktionary.org/wiki/bank#English', collocations: [] as string[], distinctions: [] as string[] };
function fixture(patch = {}) {
  const raw = { ...sense, ...patch };
  const report = buildQualityReport({ sources: [{ entryId: 'bank', term: 'bank', originalSense: raw, displaySense: raw, reviewStatus: 'pending' }], lessons: [{ entryId: 'bank', term: 'bank', sense: raw, scope: { kind: 'default' }, modes: [] }] });
  return { report, items: exportQualityWork(report).items };
}
function response(text: string, title = 'bank') {
  return { query: { pages: { '42': { pageid: 42, title, revisions: [{ revid: 12345, slots: { main: { '*': text } } }] } } } };
}
const page = '==English==\n===Noun===\n# Land beside a river.\n#: {{ux|en|We sat on the river bank.}}\n## A raised part.\n##: {{ux|en|The child example must stay separate.}}\n# A financial institution.\n#: {{ux|en|She went to the bank to withdraw cash.}}\n==French==\n===Noun===\n# Land beside a river.\n#: {{ux|en|The wrong language must stay separate.}}';

test('exact original sense gets only its direct English example and a revision-bound draft', () => {
  const f = fixture(), output = prepareSourceCandidates(f.report, f.items, [response(page)]);
  expect(output.items).toHaveLength(1);
  expect(output.items[0]).toMatchObject({ status: 'semantic-review-required', source: { title: 'bank', revision: 12345, url: 'https://en.wiktionary.org/w/index.php?title=bank&oldid=12345' }, exampleSuggestions: ['We sat on the river bank.'], missingFields: ['collocations', 'distinctions'], draft: { definition: 'Land beside a river.', example: 'We sat on the river bank.' } });
  expect(output.items[0].sourceIssue).toBeNull();
  expect(output.readyForPublication).toBe(0);
  expect(output.items[0].draft).not.toHaveProperty('reviewedAreas');
  expect(f.items[0].displaySense.example).toBe('Old text […]');
});

test('case-sensitive page identity, POS and duplicate-gloss ambiguity cannot borrow another meaning', () => {
  const f = fixture();
  for (const text of [page.replace('===Noun===', '===Verb==='), page.replace('# A financial institution.', '# Land beside a river.')]) {
    expect(prepareSourceCandidates(f.report, f.items, [response(text)]).items[0].status).toBe('manual-source-match-required');
  }
  expect(prepareSourceCandidates(f.report, f.items, [response(page, 'Bank')]).items[0].status).toBe('manual-source-match-required');
});

test('unsupported gloss templates stay unresolved instead of disappearing into an apparent exact match', () => {
  const f = fixture(), output = prepareSourceCandidates(f.report, f.items, [response(page.replace('# Land beside a river.', '# Land beside a river. {{unknown|changes the meaning}}'))]);
  expect(output.items[0].status).toBe('manual-source-match-required');
});

test('source identifiers, references and attestation dates do not obstruct an exact gloss match', () => {
  const f = fixture(), line = '# {{senseid|en|river-edge}} Land beside a river. {{defdate|from 1300}}<ref name="example">Source citation.</ref>';
  const output = prepareSourceCandidates(f.report, f.items, [response(page.replace('# Land beside a river.', line))]);
  expect(output.items[0]).toMatchObject({ status: 'semantic-review-required', source: { gloss: line }, exampleSuggestions: ['We sat on the river bank.'] });
  expect(output.readyForPublication).toBe(0);
  for (const definition of ['# {{senseid|en|river-edge}} Different land beside a river.', '# Land beside a river. {{unknown|editorial claim}}']) {
    expect(prepareSourceCandidates(f.report, f.items, [response(page.replace('# Land beside a river.', definition))]).items[0].status).toBe('manual-source-match-required');
  }
});

test('a source organisation heading cannot seed a lexical example from its overview or children', () => {
  const f = fixture();
  const text = '==English==\n===Noun===\n# {{lb|en|heading}} Land beside a river.\n#: {{ux|en|The overview sentence must not seed a lexical meaning.}}\n## An actual child meaning.\n##: {{ux|en|The child example must stay attached to its child.}}';
  const result = prepareSourceCandidates(f.report, f.items, [response(text)]).items[0];
  expect(result.status).toBe('manual-source-match-required');
  expect(result.sourceIssue).toBe('source-heading');
  expect(result.reason).toMatch(/heading/i);
  expect(result.exampleSuggestions).toEqual([]);
});

test('truncated, archaic, relation, citation and unsupported-template examples cannot seed new learning', () => {
  const f = fixture();
  const text = '==English==\n===Noun===\n# Land beside a river.\n#: {{ux|en|Thou shalt rest by the bank.}}\n#: {{ux|en|We rested […] beside the bank.}}\n#: {{ux|en|Synonyms: shore, riverside}}\n#* {{quote-book|en|passage=A quoted bank example.}}\n#: {{ux|en|The {{unknown|bank}} is steep.}}\n#: {{ux|en|A [[river]] bank is visible from here.}}';
  const output = prepareSourceCandidates(f.report, f.items, [response(text)]).items[0];
  expect(output.exampleSuggestions).toEqual(['A river bank is visible from here.']);
  expect(output.rejectedExamples).toHaveLength(5);
});

test('changed teaching contexts cannot inherit source approval or draft text from a different definition', () => {
  const f = fixture();
  const original = f.report.work[0];
  const changed = buildQualityReport({ sources: [{ entryId: 'bank', term: 'bank', originalSense: sense, displaySense: sense, reviewStatus: 'pending' }], lessons: [{ entryId: 'bank', term: 'bank', sense: { ...sense, definition: 'A financial institution.' }, scope: { kind: 'group', bookId: 'b', unitId: 'u' }, modes: [] }] });
  const item = changed.work.find(row => row.reviewStatus === 'context-review-required')!;
  const output = prepareSourceCandidates(changed, [item], [response(page)]).items[0];
  expect(output.status).toBe('manual-source-match-required');
  expect(output.draft.example).toBe('');
  expect(() => prepareSourceCandidates(f.report, [{ ...original, displayHash: 'stale' }], [response(page)])).toThrow(/stale/i);
});

test('conflicting source revisions and malformed page evidence cannot silently choose a winner', () => {
  const f = fixture(), other = response(page);
  other.query.pages['42'].revisions[0].revid = 12346;
  expect(prepareSourceCandidates(f.report, f.items, [response(page), other]).items[0].status).toBe('manual-source-match-required');
  const bad = response(page); bad.query.pages['42'].revisions[0].revid = 0;
  expect(prepareSourceCandidates(f.report, f.items, [bad]).items[0].status).toBe('manual-source-match-required');
});

test('prepositional phrases retain their POS and only their own direct examples', () => {
  const f = fixture({ pos: 'prep_phrase', definition: 'Beforehand.' });
  const text = '==English==\n===Prepositional phrase===\n# Beforehand.\n#: {{ux|en|Please book in advance.}}\n===Adverb===\n# Beforehand.\n#: {{ux|en|This is a different part of speech.}}';
  const output = prepareSourceCandidates(f.report, f.items, [response(text)], { fields: ['example'] });
  expect(output.items[0]).toMatchObject({ status: 'semantic-review-required', exampleSuggestions: ['Please book in advance.'] });
  expect(output.readyForPublication).toBe(0);
});

test('a whole issue queue includes the final partial package and retains all source and teaching variants', () => {
  const sources = Array.from({ length: 1003 }, (_, i) => ({ entryId: 'bank-' + i, term: 'bank', originalSense: sense, displaySense: sense, reviewStatus: 'pending' as const }));
  const lessons = sources.map(row => ({ entryId: row.entryId, term: row.term, sense, scope: { kind: 'default' as const }, modes: [] }));
  lessons.push({ entryId: 'bank-0', term: 'bank', sense: { ...sense, definition: 'A financial institution.' }, scope: { kind: 'default' }, modes: [] });
  const report = buildQualityReport({ sources, lessons }), before = structuredClone(report);
  const output = prepareSourceQueue(report, [response(page)], { scope: 'learning', issue: 'missing-collocations', fields: ['collocations'] });
  expect(output.total).toBe(1004);
  expect(output.packages.map(batch => batch.items.length)).toEqual([1000, 4]);
  expect(output.matched).toBe(1003);
  expect(output.manualSourceMatches).toBe(1);
  expect(output.routes.authoring).toHaveLength(1003);
  expect(output.routes.sourceResolution).toHaveLength(1);
  expect(output.routes.candidateReview).toEqual([]);
  expect(output.readyForPublication).toBe(0);
  const ids = output.packages.flatMap(batch => batch.items.map(item => item.workItemId));
  expect(new Set(ids).size).toBe(1004);
  expect(ids).toEqual(report.work.map(item => item.workItemId));
  expect(report).toEqual(before);
});

test('whole-queue routing separates source resolution, unfilled authoring and source example drafts', () => {
  const f = fixture();
  const examples = prepareSourceQueue(f.report, [response(page)], { scope: 'learning', issue: 'truncated-example', fields: ['example'], batchSize: 1 });
  expect(examples.routes.candidateReview).toEqual([f.items[0].workItemId]);
  expect(examples.routes.authoring).toEqual([]);
  expect(examples.readyForPublication).toBe(0);
  const unresolved = prepareSourceQueue(f.report, [], { scope: 'learning', issue: 'truncated-example', fields: ['example'] });
  expect(unresolved.routes.sourceResolution).toEqual([f.items[0].workItemId]);
  const empty = prepareSourceQueue(f.report, [], { scope: 'reference', issue: 'truncated-example' });
  expect(empty).toMatchObject({ total: 0, packages: [], matched: 0, manualSourceMatches: 0, semanticReviewRequired: 0, readyForPublication: 0 });
  for (const options of [{ scope: 'unknown' }, { issue: 'unknown' }, { batchSize: 0 }, { batchSize: 1001 }, { fields: [] }, { fields: ['reviewedAreas'] }]) {
    expect(() => prepareSourceQueue(f.report, [], options)).toThrow();
  }
});
