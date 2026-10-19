import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareSourceCandidates } from './vocabulary-source-candidates';

const args = process.argv.slice(2), known = new Set(['--work', '--sources', '--report', '--output', '--fields']);
for (let i = 0; i < args.length; i += 2) if (!known.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args.indexOf(args[i]) !== i) throw new Error('Use --work package.json --sources responses.json --output prepared.json [--report current-report.json] [--fields example,collocations].');
const option = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const work = option('--work'), sources = option('--sources'), output = option('--output');
if (!work || !sources || !output) throw new Error('--work, --sources and --output are required.');
const protectedPath = (file: string) => !path.resolve(file).startsWith(path.resolve('local') + path.sep);
if (protectedPath(output)) throw new Error('Candidate output must be inside ignored local/.');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
// Confirm both the current runtime snapshot and the supplied full-report snapshot.
execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit-vocabulary-quality.ts', '--check'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const report = read(option('--report') || 'local/audits/vocabulary-quality.json');
if (!report.sourceSnapshot || !fs.readFileSync('docs/vocabulary-quality-report.md', 'utf8').includes('`' + report.sourceSnapshot + '`')) throw new Error('Stale full report. Run npm run vocabulary:quality.');
const supplied = read(work), responses = read(sources);
if (!Array.isArray(supplied.items)) throw new Error('Expected an exported work package.');
const result = prepareSourceCandidates(report, supplied.items, Array.isArray(responses) ? responses : [responses], option('--fields') === undefined ? {} : { fields: option('--fields')!.split(',') });
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ ...result, sourceSnapshot: report.sourceSnapshot }, null, 2) + '\n');
console.log(JSON.stringify({ items: result.items.length, matched: result.matched, withExampleSuggestions: result.withExampleSuggestions, manualSourceMatches: result.manualSourceMatches, readyForPublication: 0 }));
