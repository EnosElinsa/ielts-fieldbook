import { beforeAll, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildVocabularyResources, vocabularyResourceHeaders } from '../../scripts/vocabularyResources';

let release: ReturnType<typeof buildVocabularyResources>;
// Every assertion reads the same release. Generate it once; the determinism test
// still compares a second independent build of the complete retained corpus.
beforeAll(() => { release = buildVocabularyResources(process.cwd()); }, 15_000);

test('the release before additional-sense expansion remains available with its immutable manifest', () => {
  const previous = release.resources.get('/vocabulary-resources/manifest.877ae53793cdeac8.json');
  expect(previous).toBeDefined();
  const manifest = JSON.parse(previous!);
  for (const url of [...Object.values(manifest.entryResources), ...Object.values(manifest.entryTeachingResources), ...manifest.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('manifest and group packs preserve the released membership order and complete teaching content', () => {
  const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const { manifest, resources } = release;
  expect(manifest.books).toEqual(catalog.books);
  expect(manifest.entryCount).toBe(catalog.entries.length);
  expect(Object.keys(manifest.entryShards)).toHaveLength(catalog.entries.length);
  for (const unit of manifest.units) {
    const members = catalog.memberships.filter((row: any) => row.bookId === unit.bookId && row.unitId === unit.id).sort((a: any, b: any) => a.order - b.order);
    expect(unit.entryIds).toEqual([...new Set(members.map((row: any) => row.entryId))]);
    expect(unit.entryCount).toBe(unit.entryIds.length);
    if (!unit.resource) continue;
    const pack = JSON.parse(resources.get(unit.resource)!);
    expect(pack.memberships).toEqual(members);
    expect(pack.entries).toEqual(unit.entryIds.map((id: string) => catalog.entries.find((entry: any) => entry.id === id)));
    expect(pack.teaching.context.version).toBe('context-2026-10-10.2');
    const teaching = JSON.parse(resources.get(unit.teachingResource!)!);
    expect(teaching.teaching).toEqual(pack.teaching);
    expect(teaching.memberships).toEqual(members);
  }
});

test('deployment headers revalidate discovery indexes and cache hashed packs immutably', () => {
  const generated = release;
  const headers = vocabularyResourceHeaders(generated.manifestUrl, generated.teachingIndexUrl);
  expect(headers).toContain(`${generated.manifestUrl}\n  Cache-Control: public, max-age=0, must-revalidate`);
  expect(headers).toContain(`${generated.teachingIndexUrl}\n  Cache-Control: public, max-age=0, must-revalidate`);
  expect(headers).toContain('/vocabulary-resources/groups/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/vocabulary-resources/entries/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/vocabulary-resources/teaching/*\n  Cache-Control: public, max-age=31536000, immutable');
});

test('resources use deterministic content-addressed URLs', () => {
  const first = release;
  const second = buildVocabularyResources(process.cwd());
  expect(second.manifestUrl).toBe(first.manifestUrl);
  expect(first.manifestUrl).toMatch(/manifest\.[a-f0-9]{16}\.json$/);
  for (const [url, content] of first.resources) {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    expect(url.endsWith(`.${hash}.json`)).toBe(true);
    // Pages decodes paths before looking up files. A request must continue to
    // name the emitted file after one or more URL decoding passes.
    expect(url).toMatch(/^\/[a-zA-Z0-9._/-]+$/);
    expect(decodeURIComponent(url)).toBe(url);
  }
});

test('previously released discovery and teaching URLs remain available with legacy identities', () => {
  const generated = release;
  const manifestUrl='/vocabulary-resources/manifest.594ea6a804861668.json';
  const teachingIndexUrl='/vocabulary-resources/teaching-index.61322c9fd3ccb3d1.json';
  expect(generated.resources.has(manifestUrl)).toBe(true);
  expect(generated.resources.has(teachingIndexUrl)).toBe(true);
  const legacy=JSON.parse(generated.resources.get(manifestUrl)!);
  expect(legacy.books.map((book: {id: string})=>book.id)).toContain('guixue:10174');
  expect(generated.manifest.books.map(book=>book.id)).not.toContain('guixue:10174');
  for(const unit of legacy.units) {
    if(!unit.resource) continue;
    const pack=JSON.parse(generated.resources.get(unit.resource)!);
    expect(pack.memberships.every((row: {bookId: string;unitId: string})=>row.bookId===unit.bookId && row.unitId===unit.id)).toBe(true);
    expect(generated.resources.has(unit.teachingResource)).toBe(true);
  }
  for(const url of [...Object.values(legacy.entryResources),...Object.values(legacy.entryTeachingResources)] as string[]) expect(generated.resources.has(url)).toBe(true);
});

test('the October 16 UI release keeps all of its immutable packs after content expansion', () => {
  const generated=release;
  const previous=JSON.parse(generated.resources.get('/vocabulary-resources/manifest.c12cb3c08c34cfa9.json')!);
  expect(previous.entryCount).toBe(7021);
  for(const unit of previous.units) {
    if(unit.resource) expect(generated.resources.has(unit.resource),unit.resource).toBe(true);
    if(unit.teachingResource) expect(generated.resources.has(unit.teachingResource),unit.teachingResource).toBe(true);
  }
  for(const url of [...Object.values(previous.entryResources),...Object.values(previous.entryTeachingResources)] as string[]) expect(generated.resources.has(url),url).toBe(true);
});

test.skipIf(!process.env.LEGACY_VOCABULARY_RESOURCE_DIRECTORY)('all archived release assets retain their exact bytes and URLs', () => {
  const archive=process.env.LEGACY_VOCABULARY_RESOURCE_DIRECTORY!;
  const generated=release;
  const files=readdirSync(archive,{recursive:true,withFileTypes:true}).filter(item=>item.isFile());
  expect(files).toHaveLength(460);
  for(const item of files) {
    const absolute=path.join(item.parentPath,item.name);
    const url='/vocabulary-resources/'+path.relative(archive,absolute).split(path.sep).join('/');
    expect(generated.resources.get(url),url).toBe(readFileSync(absolute,'utf8'));
  }
});
