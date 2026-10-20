import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportQualityWork } from './vocabulary-quality';
import { collectRevisionSources } from './vocabulary-source-collection';

const args = process.argv.slice(2), known = new Set(['--work', '--cache', '--output', '--seed', '--scope', '--issue', '--batch-size', '--refresh-missing']);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i]) || args.indexOf(args[i]) !== i) throw new Error('Unknown or repeated source option: ' + args[i]);
  if (args[i] !== '--refresh-missing' && (!args[i + 1] || args[++i].startsWith('--'))) throw new Error('Missing source option value.');
}
const option = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const workFile = option('--work'), cache = option('--cache'), output = option('--output');
if (!workFile || !cache || !output) throw new Error('--work, --cache and --output are required.');
for (const file of [cache, output]) if (!path.resolve(file).startsWith(path.resolve('local') + path.sep)) throw new Error('Source cache and output must stay inside ignored local/.');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const supplied = read(workFile);
let items: Parameters<typeof collectRevisionSources>[0];
if (Array.isArray(supplied.work)) {
  const first = exportQualityWork(supplied, { scope: option('--scope'), issue: option('--issue'), limit: 1000 });
  items = [...first.items];
  for (let offset = 1000; offset < first.total; offset += 1000) items.push(...exportQualityWork(supplied, { scope: option('--scope'), issue: option('--issue'), limit: 1000, offset }).items);
} else {
  if (option('--scope') || option('--issue')) throw new Error('Scope and issue filtering require a full quality report.');
  if (!Array.isArray(supplied.items)) throw new Error('Expected a quality report or exported work package.');
  items = supplied.items;
}
if (items.some(item => typeof item?.term !== 'string' || !item.term.trim())) throw new Error('Every work item needs a term.');
fs.mkdirSync(cache, { recursive: true });
const cached: unknown[] = [];
const add = (value: unknown) => cached.push(...Array.isArray(value) ? value : [value]);
for (const file of fs.readdirSync(cache).sort().filter(name => name.endsWith('.json'))) add(read(path.join(cache, file)));
if (option('--seed')) add(read(option('--seed')!));
const execute = promisify(execFile);
const persist = (response: unknown) => {
  const text = JSON.stringify(response) + '\n', name = createHash('sha256').update(text).digest('hex') + '.json', file = path.join(cache!, name);
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Conflicting source cache bytes.');
  } else {
    const temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, text);
    fs.renameSync(temporary, file);
  }
};
const result = await collectRevisionSources(items, cached, async titles => {
  const url = new URL('https://en.wiktionary.org/w/api.php');
  for (const [key, value] of Object.entries({ action: 'query', format: 'json', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', maxlag: '5', titles: titles.join('|') })) url.searchParams.set(key, value);
  if (process.platform === 'win32') {
    const reply = await execute('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--max-time', '30', '--user-agent', 'IELTS-Fieldbook/1.0 (open vocabulary source collection)', url.href], { windowsHide: true, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
    return JSON.parse(reply.stdout);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'IELTS-Fieldbook/1.0 (open vocabulary source collection)' } });
  if (!response.ok) throw new Error('Source request failed: HTTP ' + response.status);
  return response.json();
}, {
  refreshMissing: args.includes('--refresh-missing'),
  ...(option('--batch-size') === undefined ? {} : { batchSize: Number(option('--batch-size')) }),
  onResponse: persist,
  onRetry: async attempt => {
    console.log(JSON.stringify({ retry: attempt }));
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  },
  onProgress: state => { console.log(JSON.stringify(state)); },
});
const { responses, ...summary } = result;
// Retain imported seed evidence too, so the next run can resume without --seed.
for (const response of responses) persist(response);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(responses, null, 2) + '\n');
fs.writeFileSync(output + '.report.json', JSON.stringify({ schemaVersion: 1, sourceSnapshot: supplied.sourceSnapshot ?? null, ...summary }, null, 2) + '\n');
console.log(JSON.stringify({ requested: summary.requested, available: summary.available, reused: summary.reused, unavailable: summary.unavailable.length, unresolved: summary.unresolved.length, conflictingTitles: summary.conflictingTitles.length }));
if (summary.unresolved.length) process.exitCode = 1;
