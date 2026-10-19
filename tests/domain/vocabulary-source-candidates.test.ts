import { expect, test } from 'vitest';
import { buildQualityReport, exportQualityWork } from '../../scripts/vocabulary-quality';
import { prepareSourceCandidates } from '../../scripts/vocabulary-source-candidates';

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
