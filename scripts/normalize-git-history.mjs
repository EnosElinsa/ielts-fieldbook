import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const repository = resolve(process.argv[2] || '.');
const output = resolve(process.argv[3] || 'local/history-rewrite');
const reference = process.argv[4] || 'master';
const git = (...args) => {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
};
await mkdir(output, { recursive: true });
const commits = git('rev-list', '--reverse', '--topo-order', reference).split('\n');
const overrides = {
  'Rebuild the local-first IELTS fieldbook as a React app so the source is maintainable and publishable.': 'feat: rebuild the IELTS fieldbook as a maintainable React app',
  'remove original question source links': 'fix: remove original question source links',
};
function title(subject, merge) {
  if (merge) return `chore(merge): ${subject.replace(/^Merge\s+/i, '').replace(/^./, value => value.toLowerCase())}`;
  if (/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .+/.test(subject)) return subject;
  if (overrides[subject]) return overrides[subject];
  const type = /^(Document|Record)/i.test(subject) ? 'docs' : /^(Verify|Assert|Await)|\btest\b/i.test(subject) ? 'test' : /^(Add|Complete|Bind|Integrate|Finish|Make vocabulary progress)/i.test(subject) ? 'feat' : /lookup linear/i.test(subject) ? 'perf' : 'fix';
  return `${type}: ${subject.replace(/^./, value => value.toLowerCase())}`;
}
const titles = {};
const mapping = {};
for (const old of commits) {
  const read = spawnSync('git', ['-C', repository, 'cat-file', 'commit', old], { encoding: 'utf8' });
  if (read.status !== 0) throw new Error(`Could not read commit: ${old}`);
  const raw = read.stdout;
  const separator = raw.indexOf('\n\n');
  const header = raw.slice(0, separator);
  if (/^gpgsig /m.test(header)) throw new Error('Signed commits need an explicit signature migration.');
  const message = raw.slice(separator + 2);
  const parents = [...header.matchAll(/^parent ([a-f0-9]+)$/gm)].map(match => match[1]);
  const subject = message.split('\n')[0];
  const normalized = title(subject, parents.length > 1);
  if (!/^[\x20-\x7e]+$/.test(normalized)) throw new Error(`Non-English title needs an explicit mapping: ${old}`);
  const rewritten = `${header.replace(/^parent ([a-f0-9]+)$/gm, (_, parent) => `parent ${mapping[parent]}`)}\n\n${normalized}${message.slice(subject.length)}`;
  const result = spawnSync('git', ['-C', repository, 'hash-object', '-t', 'commit', '-w', '--stdin'], { input: rewritten, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Could not write the normalized commit.');
  const current = result.stdout.trim();
  mapping[old] = current; titles[old] = { old: subject, new: normalized };
  const readHeader = git('cat-file', 'commit', current).split('\n\n')[0];
  if (readHeader !== header.replace(/^parent ([a-f0-9]+)$/gm, (_, parent) => `parent ${mapping[parent]}`)) throw new Error(`Tree or metadata changed: ${old}`);
}
const oldHead = git('rev-parse', reference);
await writeFile(resolve(output, 'sha-map.json'), `${JSON.stringify(mapping, null, 2)}\n`);
await writeFile(resolve(output, 'titles.json'), `${JSON.stringify(titles, null, 2)}\n`);
git('update-ref', 'refs/heads/normalized-master', mapping[oldHead]);
await writeFile(resolve(output, 'verification.json'), `${JSON.stringify({ oldHead, newHead: mapping[oldHead], count: commits.length, verified: ['tree', 'author', 'committer', 'dates', 'parent graph'], checkedAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`Verified ${commits.length} normalized commits. ${oldHead} -> ${mapping[oldHead]}`);
