import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareSourceCandidates, prepareSourceQueue } from './vocabulary-source-candidates';

const args = process.argv.slice(2), known = new Set(['--work', '--sources', '--report', '--output', '--fields', '--all', '--scope', '--issue', '--batch-size']);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i]) || args.indexOf(args[i]) !== i) throw new Error('Unknown or repeated option: ' + args[i]);
  if (args[i] !== '--all' && (!args[i + 1] || args[++i].startsWith('--'))) throw new Error('Missing option value.');
}
const option = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const work = option('--work'), sources = option('--sources'), output = option('--output');
const all = args.includes('--all');
if (!sources || !output || all === Boolean(work)) throw new Error('Choose --work package.json or --all; --sources and --output are required.');
if (!all && ['--scope', '--issue', '--batch-size'].some(name => option(name) !== undefined)) throw new Error('Queue options require --all.');
const protectedPath = (file: string) => !path.resolve(file).startsWith(path.resolve('local') + path.sep);
if (protectedPath(output)) throw new Error('Candidate output must be inside ignored local/.');
if (all && fs.existsSync(output) && (!fs.statSync(output).isDirectory() || fs.readdirSync(output).length)) throw new Error('Whole-queue output must be a new or empty directory; existing authoring work is preserved.');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
// Confirm both the current runtime snapshot and the supplied full-report snapshot.
execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit-vocabulary-quality.ts', '--check'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const report = read(option('--report') || 'local/audits/vocabulary-quality.json');
if (!report.sourceSnapshot || !fs.readFileSync('docs/vocabulary-quality-report.md', 'utf8').includes('`' + report.sourceSnapshot + '`')) throw new Error('Stale full report. Run npm run vocabulary:quality.');
const responses = read(sources), evidence = Array.isArray(responses) ? responses : [responses];
const fields = option('--fields') === undefined ? {} : { fields: option('--fields')!.split(',') };
if (all) {
  const { packages, routes, ...summary } = prepareSourceQueue(report, evidence, { ...fields, scope: option('--scope'), issue: option('--issue'),
    ...(option('--batch-size') === undefined ? {} : { batchSize: Number(option('--batch-size')) }) });
  fs.mkdirSync(output, { recursive: true });
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const files = packages.map((batch, i) => {
    const name = 'prepared-' + String(i + 1).padStart(4, '0') + '.json';
    write(name, { ...batch, sourceSnapshot: report.sourceSnapshot });
    return { path: name, items: batch.items.length, matched: batch.matched, manualSourceMatches: batch.manualSourceMatches };
  });
  write('routes.json', routes);
  write('manifest.json', { ...summary, sourceSnapshot: report.sourceSnapshot, files, routeCounts: Object.fromEntries(Object.entries(routes).map(([key, ids]) => [key, ids.length])) });
  fs.writeFileSync(path.join(output, 'authoring.jsonl'), packages.flatMap(batch => batch.items).map(row => JSON.stringify({
    workItemId: row.workItemId, term: row.term, senseId: row.senseId, scopes: row.scopes, status: row.status,
    currentSense: row.currentSense, originalSense: row.originalSense, metadata: row.metadata,
    reason: row.reason, sourceIssue: row.sourceIssue, source: row.source, missingFields: row.missingFields, unchangedFields: row.unchangedFields,
    draft: row.draft,
  })).join('\n') + (summary.total ? '\n' : ''), { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'AUTHORING.md'), `# Whole-queue authoring

This job contains ${summary.total} exact learning-content variants. Processing packages are not release boundaries.

Use authoring.jsonl as model/reviewer input and prepared-*.json for complete source-resolution context. Every item retains its current meaning, original source meaning, usage, register, existing teaching fields, identities and scopes. routes.json separates sourceResolution, authoring and candidateReview; none is publication approval.

Author only the requested fields. Keep the exact meaning, part of speech and teaching context. Preserve existing valid text. Do not borrow a different meaning's examples, collocations, comparisons or media. Do not invent source quotations, citations, frequency claims or editorial approval. Resolve missing/conflicting sources before integration. Optional comparisons, questions and diagrams need a concrete teaching purpose; do not add them to fill quotas.

Return focused candidate objects as JSONL: workItemId, sourceHash, displayHash, referenceUrl and changes. Copy identity fingerprints from draft. Omit unchanged fields and optional fields without useful supported content. Put unresolved/abstained items in a separate exceptions file with workItemId and a reason; do not disguise them as completed candidates. The source URL supports sense identity; it does not imply the source wrote an authored example or comparison.

Run vocabulary:quality -- --candidates on each returned candidate package. Format, identity and duplicate checks do not replace semantic review. Definition/POS edits require reviewing retained teaching fields and media bindings. Keep the complete job open until every item has a reviewed change or an explicit supported disposition. Combine compatible changes before the final release checks.
`, { flag: 'wx' });
  console.log(JSON.stringify({ ...summary, packages: files.length, output }));
} else {
  const supplied = read(work!);
  if (!Array.isArray(supplied.items)) throw new Error('Expected an exported work package.');
  const result = prepareSourceCandidates(report, supplied.items, evidence, fields);
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ ...result, sourceSnapshot: report.sourceSnapshot }, null, 2) + '\n');
  console.log(JSON.stringify({ items: result.items.length, matched: result.matched, withExampleSuggestions: result.withExampleSuggestions, manualSourceMatches: result.manualSourceMatches, readyForPublication: 0 }));
}
