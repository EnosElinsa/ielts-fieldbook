import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { VOCABULARY_CATALOG } from '../src/domain/vocabulary/catalog';
import { hasVocabularySenseEdits, learningTask, publicVocabularyExample } from '../src/domain/vocabulary/content';
import { resolveVocabularyLearningContext } from '../src/domain/vocabulary/context';
import { isVocabularyPracticeReference, isVocabularyReadingNote, getVocabularyLearningPriority, supplementVocabularySense } from '../src/domain/vocabulary/readiness';
import { registerVocabularyTeaching, type VocabularyTeachingData } from '../src/domain/vocabulary/runtimeData';
import { vocabularySensePresentation } from '../src/domain/vocabulary/dictionaryPresentation';
import type { VocabularyEntry, VocabularySense } from '../src/domain/vocabulary/types';
// @ts-expect-error This executable audit is shared with its existing CLI.
import { inspectDictionaryReview } from './audit-vocabulary-dictionary.mjs';
import { buildQualityReport, exportQualityWork, validateQualityCandidates, type QualityLesson, type QualityReport, type QualitySource, type Scope } from './vocabulary-quality';

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const domain = 'src/domain/vocabulary/';
const data = (name: string) => read(domain + name + '.json');
const catalog = read('public/vocabulary-catalog.json');
Object.assign(VOCABULARY_CATALOG, catalog);
registerVocabularyTeaching({
  senseBaselines: {},
  curriculum: { common: data('groupCurriculumCommon'), topics: [...data('groupCurriculumTopicsA'), ...data('groupCurriculumTopicsB'), ...data('groupCurriculumTopicsC')], source: data('groupCurriculumSource'), repairs: data('groupCurriculumRepairs'), modern: data('groupCurriculumModernDefaults') },
  readiness: { core: [...data('readinessContent0'), ...data('readinessContent1'), ...data('readinessContent2')], corrections: data('readinessCorrections'), defaults: data('readinessDefaults') },
  learning: data('learningSenseOverlay'), tasks: data('taskSenseBindings'), context: data('contextSenseOverlay'),
} as VocabularyTeachingData);
const index = read('public/dictionary/index.json');
const dictionaries = Object.fromEntries(Object.entries(index).map(([term, file]) => [term, read('public/dictionary/' + file)]));
const corrections = data('readinessCorrections'), records = data('dictionaryReviewLedger').records, restoredSources = data('dictionarySenseSources');
const audit = inspectDictionaryReview({ entries: catalog.entries, dictionaries, corrections, records, diagrams: data('senseDiagrams'), restoredSources });
if (audit.errors.length) throw new Error('Existing editorial audit failed:\n' + audit.errors.join('\n'));
const statuses = new Map(audit.inventory.map((row: { term: string; senseId: string; status: string }) => [JSON.stringify([row.term, row.senseId]), row.status]));
const entries = new Map<string, VocabularyEntry>((catalog.entries as VocabularyEntry[]).map(entry => [entry.id, entry]));
const byTerm = new Map((catalog.entries as VocabularyEntry[]).map(entry => [entry.term.trim().toLowerCase(), entry]));
const sources: QualitySource[] = [], lessons: QualityLesson[] = [];
for (const [term, dictionary] of Object.entries(dictionaries) as [string, { senses: VocabularySense[] }][]) {
  const entry = byTerm.get(term);
  if (!entry) throw new Error('Missing catalog term: ' + term);
  const originals = [...dictionary.senses, ...restoredSources.filter((row: { term: string }) => row.term === term).map((row: { sense: VocabularySense }) => row.sense)];
  for (const raw of originals) {
    const sense = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
    sources.push({ entryId: entry.id, term: entry.term, originalSense: raw, displaySense: sense,
      reviewStatus: statuses.get(JSON.stringify([term, raw.id])) === 'reviewed' ? 'reviewed' : 'pending',
      priority: getVocabularyLearningPriority(entry.id, sense), readingNote: isVocabularyReadingNote(entry.id, sense), referenceOnly: isVocabularyPracticeReference(entry.id, sense) });
  }
}
function addLesson(entry: VocabularyEntry, scope: Scope) {
  const request = scope.kind === 'group' ? { bookId: scope.bookId, unitId: scope.unitId } : {};
  const resolved = resolveVocabularyLearningContext(entry, request);
  const senses = resolved.curriculum?.basis === 'multiple' ? resolved.curriculum.senses : resolved.sense ? [resolved.sense] : [];
  if (!senses.length) throw new Error('Missing learning meaning: ' + JSON.stringify([entry.id, scope]));
  for (const selected of senses) {
    const current = selected.id === resolved.sense?.id ? resolved : resolveVocabularyLearningContext(entry, { ...request, senseId: selected.id });
    const sense = current.sense;
    if (!sense || sense.id !== selected.id) throw new Error('Selected curriculum identity mismatch: ' + entry.id);
    const fallback = !vocabularySensePresentation(sense).example ? publicVocabularyExample(entry.id, sense) : undefined;
    const modes = ['cloze', 'distinction'].filter(mode => learningTask(current.entry, sense, mode));
    lessons.push({ entryId: entry.id, term: entry.term, sense: fallback ? { ...sense, example: fallback.example } : sense, scope, modes,
      readingNote: isVocabularyReadingNote(entry.id, fallback?.sense || sense), referenceOnly: isVocabularyPracticeReference(entry.id, sense) });
  }
}
for (const entry of entries.values()) addLesson(entry, { kind: 'default' });
for (const member of catalog.memberships) {
  const entry = entries.get(member.entryId);
  if (!entry) throw new Error('Missing membership entry: ' + member.entryId);
  addLesson(entry, { kind: 'group', bookId: member.bookId, unitId: member.unitId });
}
const report = buildQualityReport({ sources, lessons });
if (report.summary.dictionarySenses !== audit.summary.senses || report.summary.reviewed !== audit.summary.reviewed) throw new Error('Full dictionary coverage differs from the editorial audit.');
const snapshotFiles = ['public/vocabulary-catalog.json', 'public/dictionary/index.json', 'scripts/vocabulary-quality.ts', 'scripts/audit-vocabulary-quality.ts', 'scripts/audit-vocabulary-dictionary.mjs', ...fs.readdirSync(domain).filter(name => name.endsWith('.json') || ['content.ts', 'context.ts', 'curriculum.ts', 'readiness.ts', 'dictionaryPresentation.ts'].includes(name)).sort().map(name => domain + name), ...Object.values(index).map(file => 'public/dictionary/' + file)];
const digest = createHash('sha256');
for (const file of snapshotFiles) digest.update(file + '\0').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const fullReport = { ...report, sourceSnapshot: digest.digest('hex'), privateDataRead: false, externalRequests: 0 };

function markdown(result: QualityReport) {
  const s = result.summary;
  const issues = Object.entries(result.byIssue).map(([issue, count]) => `| ${issue} | ${result.signalKinds[issue]} | ${count.learning} | ${count.dictionary ?? 'Not scanned'} |`).join('\n');
  const visible = result.work.filter(row => row.scopes.length && row.signals.length).slice(0, 20);
  return `# Vocabulary quality and bulk work queue

Generated with \`npm run vocabulary:quality\` from checked-in public data and the actual learning-context and exercise resolvers. No account data or external services are read.

Source snapshot: \`${fullReport.sourceSnapshot}\`.

## Coverage

| Measure | Count |
| --- | ---: |
| Catalogue words | ${entries.size} |
| Source dictionary terms | ${Object.keys(index).length} |
| Source and restored dictionary senses | ${s.dictionarySenses} |
| Existing editorial reviews | ${s.reviewed} |
| Dictionary senses still pending | ${s.pending} |
| Words with a resolved learning meaning | ${s.learningEntries} |
| Distinct learning-content variants | ${s.learningVariants} |
| Default/group learning contexts, including multiple-meaning lessons | ${s.learningContexts} |
| Learning variants with a displayed example or reading note | ${s.learningWithExamples} |
| Learning variants with collocations or reading cues | ${s.learningWithCollocations} |
| Learning variants with distinction notes | ${s.learningWithDistinctions} |
| Learning variants supporting sentence gaps | ${s.learningWithCloze} |
| Learning variants supporting distinction questions | ${s.learningWithDistinctionTask} |
| Learning variants with content-review signals | ${s.learningWithReviewSignals} |
| Learning variants without content-review signals | ${s.learningWithoutReviewSignals} |
| Learning variants with enrichment opportunities | ${s.learningWithEnrichmentSignals} |
| Source groups sharing a normalised definition and POS within one word | ${s.duplicateGlossGroups} |

Learning variants preserve exact content and provenance. A word can have a default, topic-specific content and additional multiple-meaning lessons. Shared text is counted once per exact variant, with every default/group scope retained. Dictionary counts exclude separate teaching variants. Context-review-required does not reverse or add an editorial dictionary review.

## Issue queue

| Automatic signal | Work category | Learning variants | Dictionary variants |
| --- | --- | ---: | ---: |
${issues}

These signals are candidates for review, not proven linguistic defects. A phrase can be a valid example; an old quotation can be appropriate reading material; two glosses can belong to distinct source identities. Typed reading notes and reference records do not require sentence gaps. Exercise availability is scanned for learning variants only, not every reference meaning. The availability of a question is not proof of its semantic quality. No missing-diagram signal is generated.

Content-review signals precede enrichment opportunities in the visible work queue. Missing collocations, distinctions or a particular exercise are enrichment opportunities, not a claim that every meaning needs every field. Having no content-review signal is not semantic approval. The original per-signal counts and complete pending dictionary ledger are retained. Group reuse is a tie-breaker, not a word-frequency claim; it cannot put enrichment ahead of a content-review signal. Remaining dictionary work follows visible work, with explicitly authored specialist/historical/proper-name records last. Unclassified dictionary meanings remain in the complete queue.

## First visible work items

| Word | Sense | Signals | Default/group contexts |
| --- | --- | --- | ---: |
${visible.map(row => `| ${row.term.replace(/\|/g, '\\|')} | ${row.senseId} | ${row.signals.join(', ')} | ${row.scopes.length} |`).join('\n')}

The complete fingerprinted queue is generated at \`local/audits/vocabulary-quality.json\`. It is an offline work artifact, not a published dictionary or an approval ledger. Export bounded packages by problem type using the workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md).
`;
}
const args = process.argv.slice(2);
const known = new Set(['--check', '--export', '--candidates', '--scope', '--issue', '--limit', '--offset', '--output']);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i])) throw new Error('Unknown option: ' + args[i]);
  if (!['--check', '--export'].includes(args[i]) && (!args[i + 1] || args[++i].startsWith('--'))) throw new Error('Missing option value.');
}
const option = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const output = (value: unknown, file?: string) => {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  else console.log(text);
};
if (args.includes('--export')) {
  if (args.includes('--check') || option('--candidates')) throw new Error('Choose one operation.');
  output(exportQualityWork(report, { scope: option('--scope'), issue: option('--issue'), ...(option('--limit') ? { limit: Number(option('--limit')) } : {}), ...(option('--offset') ? { offset: Number(option('--offset')) } : {}) }), option('--output'));
} else if (option('--candidates')) {
  if (args.includes('--check')) throw new Error('Choose one operation.');
  const file = option('--candidates')!, text = fs.readFileSync(file, 'utf8');
  const values: unknown = file.endsWith('.jsonl') || file.endsWith('.ndjson') ? text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)) : JSON.parse(text);
  if (!Array.isArray(values) || !values.length || values.length > 1000) throw new Error('Supply an array or JSONL with 1–1000 candidates.');
  const validation = validateQualityCandidates(report, values); output(validation, option('--output'));
  if (validation.errors.length) process.exitCode = 1;
} else {
  if (option('--scope') || option('--issue') || option('--limit') || option('--offset') || option('--output')) throw new Error('Package options require --export.');
  const rendered = markdown(report), file = 'docs/vocabulary-quality-report.md';
  if (args.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== rendered) throw new Error('Quality report is stale. Run npm run vocabulary:quality.');
  } else {
    fs.mkdirSync('local/audits', { recursive: true });
    fs.writeFileSync('local/audits/vocabulary-quality.json', JSON.stringify(fullReport) + '\n'); fs.writeFileSync(file, rendered);
  }
  output({ ...report.summary, byIssue: report.byIssue, sourceSnapshot: fullReport.sourceSnapshot, editorialLedgerChanged: false });
}
