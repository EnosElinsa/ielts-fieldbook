import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { claimReviewPackage, createReviewJobs, transitionReviewTerm, verifyReviewManifest, type ReviewChange, type ReviewManifest, type ReviewReport } from './vocabulary-review-jobs';

/** Same public source snapshot as audit-vocabulary-quality.ts; no generated files are written. */
export function currentQualitySourceSnapshot(root = process.cwd()) {
  const domain = 'src/domain/vocabulary/';
  const index = JSON.parse(fs.readFileSync(path.join(root, 'public/dictionary/index.json'), 'utf8')) as Record<string, string>;
  const files = ['public/vocabulary-catalog.json', 'public/dictionary/index.json', 'scripts/vocabulary-quality.ts', 'scripts/audit-vocabulary-quality.ts', 'scripts/audit-vocabulary-dictionary.mjs',
    ...fs.readdirSync(path.join(root, domain)).filter(name => name.endsWith('.json') || ['content.ts', 'context.ts', 'curriculum.ts', 'readiness.ts', 'dictionaryPresentation.ts'].includes(name)).sort().map(name => domain + name),
    ...Object.values(index).map(file => 'public/dictionary/' + file)];
  const digest = createHash('sha256');
  for (const file of files) digest.update(file + '\0').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
  return digest.digest('hex');
}

function inside(directory: string, file: string) {
  const relative = path.relative(directory, file);
  return Boolean(relative) && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

function localPath(root: string, file: string) {
  const local = path.resolve(root, 'local'), absolute = path.resolve(root, file);
  if (!inside(local, absolute)) throw new Error('Job output and manifest must stay inside ignored local/.');
  // Existing directory links must not turn a local-looking path into a public/external write.
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (fs.existsSync(local)) {
    const realLocal = fs.realpathSync(local), realAncestor = fs.realpathSync(ancestor);
    if (realAncestor !== realLocal && !inside(realLocal, realAncestor)) throw new Error('Job path leaves ignored local/ through a directory link.');
  }
  return absolute;
}

function withLock<T>(file: string, operation: () => T): T {
  const lock = file + '.lock';
  let handle: number;
  try { handle = fs.openSync(lock, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Manifest is busy: exclusive lock already exists.'); throw error; }
  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    return operation();
  } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}

function atomicWrite(file: string, value: unknown) {
  const temporary = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** Offline commands; imports have no side effects and never start an audit subprocess. */
export function runReviewJobsCli(args: string[], root = process.cwd()) {
  const [command, ...flags] = args;
  const options = new Map<string, string>();
  const allowed = command === 'create' ? ['--report', '--output', '--target'] : command === 'claim' ? ['--report', '--manifest', '--package', '--actor'] : command === 'update' ? ['--report', '--manifest', '--request'] : command === 'verify' ? ['--report', '--manifest'] : [];
  if (!allowed.length) throw new Error('Choose create, claim, update or verify.');
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index], value = flags[index + 1];
    if (!allowed.includes(name) || options.has(name) || !value || value.startsWith('--')) throw new Error('Unknown, repeated or missing option: ' + name);
    options.set(name, value);
  }
  const required = (name: string) => { const value = options.get(name); if (!value) throw new Error('Required option: ' + name); return value; };
  const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  const loadReport = (file: string) => {
    const report = read<ReviewReport>(path.resolve(root, file));
    if (report.sourceSnapshot !== currentQualitySourceSnapshot(root)) throw new Error('Stale source snapshot: regenerate the complete quality report and create a fresh job.');
    return report;
  };
  if (command === 'create') {
    const output = localPath(root, required('--output'));
    if (fs.existsSync(output) && (!fs.statSync(output).isDirectory() || fs.readdirSync(output).length)) throw new Error('Create requires a new or empty output directory; existing author files are preserved.');
    const reportPath = path.resolve(root, options.get('--report') || 'local/audits/vocabulary-quality.json');
    const job = createReviewJobs(loadReport(reportPath), { ...(options.has('--target') ? { targetPendingSenses: Number(options.get('--target')) } : {}) });
    fs.mkdirSync(output, { recursive: true });
    withLock(path.join(output, 'manifest.json'), () => {
      if (fs.readdirSync(output).some(file => file !== 'manifest.json.lock')) throw new Error('Create requires an empty output directory.');
      const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
      for (const batch of job.packages) write(batch.id + '.json', batch);
      write('job.json', { reportPath, sourceSnapshot: job.manifest.sourceSnapshot });
      write('manifest.json', job.manifest);
    });
    return { output, ...job.manifest.summary, packages: job.manifest.packages.length, editorialLedgerChanged: false };
  }
  const file = localPath(root, required('--manifest'));
  const reportOption = options.get('--report') || read<{ reportPath: string }>(path.join(path.dirname(file), 'job.json')).reportPath;
  const report = loadReport(reportOption);
  const operate = () => {
    const manifest = read<ReviewManifest>(file);
    verifyReviewManifest(manifest, report);
    if (command === 'verify') return { verified: true, sourceSnapshot: manifest.sourceSnapshot, ...manifest.summary };
    const next = command === 'claim' ? claimReviewPackage(manifest, report, required('--package'), required('--actor'))
      : transitionReviewTerm(manifest, report, read<ReviewChange>(path.resolve(root, required('--request'))));
    // Recheck the source just before replacing state if files changed while preparing this operation.
    if (currentQualitySourceSnapshot(root) !== report.sourceSnapshot) throw new Error('Source snapshot changed during this operation.');
    atomicWrite(file, next);
    return { updated: true, sourceSnapshot: next.sourceSnapshot, stages: Object.fromEntries(['unclaimed', 'claimed', 'draft', 'source-unresolved', 'checked', 'integrated'].map(stage => [stage, next.terms.filter(row => row.stage === stage).length])), editorialLedgerChanged: false };
  };
  return command === 'verify' ? operate() : withLock(file, operate);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  console.log(JSON.stringify(runReviewJobsCli(process.argv.slice(2))));
}
