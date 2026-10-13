import { readFile, writeFile, mkdir, readdir, stat, rename, cp } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] || '.');
const backup = resolve(process.argv[3] || 'local/cleanup-backup');
const apply = process.argv.includes('--apply');
const privateArtifacts = process.argv.includes('--private-artifacts');
const checksum = value => createHash('sha256').update(value).digest('hex');
const database = join(backup, '..', 'database');
const manifest = JSON.parse(await readFile(join(database, 'backup-manifest.json'), 'utf8'));
if (!manifest.completedAt || Object.keys(manifest.tables).length < 30) throw new Error('A complete database backup is required before cleanup.');
for (const [table, record] of Object.entries(manifest.tables)) {
  const bytes = await readFile(join(database, `${table}.json`));
  if (checksum(bytes) !== record.sha256 || JSON.parse(bytes).length !== record.count) throw new Error(`Backup verification failed: ${table}`);
}
const reports = ['vocabulary-context-audit.json', 'vocabulary-curriculum-audit.json', 'vocabulary-readiness-audit.json', 'vocabulary-media-audit.json', 'exam-readiness-audit.json', 'performance-results.json'];
const candidates = privateArtifacts ? [] : [...reports.map(name => `docs/${name}`), 'docs/superpowers'];
if (privateArtifacts) {
  candidates.push('.playwright-cli', 'dist', '_en.js', 'build-speaking-samples.js');
  for (const item of await readdir(join(root, 'local'), { withFileTypes: true }).catch(() => [])) {
    if (item.isFile() && /\.(log|tsbuildinfo)$/.test(item.name)) candidates.push(`local/${item.name}`);
  }
}
const records = [];
for (const candidate of candidates) {
  const path = resolve(root, candidate);
  const within = relative(root, path);
  if (!within || within.startsWith('..') || resolve(root, within) !== path) throw new Error('Cleanup target is outside the selected workspace.');
  const info = await stat(path).catch(() => null);
  if (!info) continue;
  const destination = resolve(backup, candidate);
  if (destination === path || relative(path, destination).startsWith('..') === false) throw new Error('Backup cannot be inside its cleanup target.');
  const record = { path: candidate, destination, bytes: info.isFile() ? info.size : null, sha256: info.isFile() ? checksum(await readFile(path)) : null };
  if (apply) {
    await mkdir(resolve(destination, '..'), { recursive: true });
    if (await stat(destination).catch(() => null)) throw new Error(`Backup already exists: ${candidate}`);
    if (reports.includes(candidate.slice(5))) {
      await cp(path, destination);
      const generated = join(root, 'local/audits', candidate.slice(5));
      await mkdir(resolve(generated, '..'), { recursive: true });
      await rename(path, generated);
    } else await rename(path, destination);
    if (record.sha256 && checksum(await readFile(destination)) !== record.sha256) throw new Error(`Cleanup archive mismatch: ${candidate}`);
  }
  records.push(record);
}
if (apply) {
  await mkdir(backup, { recursive: true });
  await writeFile(join(backup, 'cleanup-manifest.json'), `${JSON.stringify({ root, completedAt: new Date().toISOString(), records }, null, 2)}\n`);
}
console.log(`${apply ? 'Archived' : 'Would archive'} ${records.length} generated/stale paths; ${records.reduce((sum,row)=>sum+(row.bytes||0),0)} file bytes.`);
