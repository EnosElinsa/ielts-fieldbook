import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
// @ts-expect-error The release helper is an executable ES module.
import { retainVocabularyResources } from '../../scripts/retain-vocabulary-resources.mjs';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, {recursive:true, force:true}))); });
async function releases() {
  const root = await mkdtemp(join(tmpdir(), 'fieldbook-retention-'));
  directories.push(root);
  const old = join(root, 'old'); const next = join(root, 'next');
  await Promise.all([mkdir(join(old, 'vocabulary-resources/groups'), {recursive:true}), mkdir(join(next, 'vocabulary-resources'), {recursive:true})]);
  return {old, next};
}
const assetName = (body: string) => `group.${createHash('sha256').update(body).digest('hex').slice(0,16)}.json`;

test('old hashed packs remain available without replacing current resources, with idempotent retention', async () => {
  const {old, next} = await releases();
  const body = JSON.stringify({entries:[{id:'old-entry'}]});
  const name = assetName(body);
  await writeFile(join(old, 'vocabulary-resources/groups', name), body);
  await writeFile(join(next, 'vocabulary-resources/current.json'), '{"version":2}');
  expect(await retainVocabularyResources(old, next)).toBe(1);
  expect(await readFile(join(next, 'vocabulary-resources/groups', name), 'utf8')).toBe(body);
  expect(await readFile(join(next, 'vocabulary-resources/current.json'), 'utf8')).toBe('{"version":2}');
  expect(await retainVocabularyResources(old, next)).toBe(0);
});

test('a tampered old release and a conflicting destination are rejected before resources are copied', async () => {
  const {old, next} = await releases();
  const body = '{"version":1}'; const name = assetName(body);
  await writeFile(join(old, 'vocabulary-resources/groups', name), '{"version":9}');
  await expect(retainVocabularyResources(old, next)).rejects.toThrow('hash mismatch');
  await writeFile(join(old, 'vocabulary-resources/groups', name), body);
  await mkdir(join(next, 'vocabulary-resources/groups'));
  await writeFile(join(next, 'vocabulary-resources/groups', name), 'corrupt');
  await expect(retainVocabularyResources(old, next)).rejects.toThrow('collision');
});
