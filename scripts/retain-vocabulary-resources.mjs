import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Carry immutable assets from a prior release into a newly built Pages artifact. */
export async function retainVocabularyResources(previousDist, nextDist) {
  const source = resolve(previousDist, 'vocabulary-resources');
  const destination = resolve(nextDist, 'vocabulary-resources');
  if (source === destination) throw new Error('Previous and next release directories must differ.');
  const validated = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Resource symlinks are not allowed: ${name}`);
      if (entry.isDirectory()) { await visit(join(directory, entry.name), name); continue; }
      if (!entry.isFile()) throw new Error(`Unexpected resource: ${name}`);
      const expected = entry.name.match(/\.([a-f0-9]{16})\.json$/)?.[1];
      if (!expected) throw new Error(`Resource is not content-addressed: ${name}`);
      const body = await readFile(join(directory, entry.name));
      const actual = createHash('sha256').update(body).digest('hex').slice(0, 16);
      if (actual !== expected) throw new Error(`Resource hash mismatch: ${name}`);
      JSON.parse(body.toString());
      const target = join(destination, name);
      const existing = await readFile(target).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (existing && !existing.equals(body)) throw new Error(`Resource collision: ${name}`);
      if (!existing) validated.push({ target, body });
    }
  }
  // Validate the entire artifact before copying; no new manifest replaces the
  // generated current manifest, since manifests also use content hashes.
  await visit(source);
  for (const { target, body } of validated) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'wx' });
  }
  return validated.length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const index = value.indexOf('=');
    return [value.slice(0, index).replace(/^--/, ''), value.slice(index + 1)];
  }));
  if (!args.from || !args.to) throw new Error('Use --from=<previous dist> --to=<new dist>.');
  console.log(`Retained ${await retainVocabularyResources(args.from, args.to)} vocabulary resources.`);
}
