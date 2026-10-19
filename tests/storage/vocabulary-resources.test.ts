import { beforeAll, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildVocabularyResources, vocabularyResourceHeaders } from '../../scripts/vocabularyResources';

let release: ReturnType<typeof buildVocabularyResources>;
// Every assertion reads the same release. Generate it once; the determinism test
// still compares a second independent build of the complete retained corpus.
beforeAll(() => { release = buildVocabularyResources(process.cwd()); }, 15_000);

test('learning priority is delivered in scoped teaching while the preceding complete release keeps its original bytes', () => {
  const baseline = JSON.parse(readFileSync('src/domain/vocabulary/resourceDictionaryRound19Baseline.json', 'utf8'));
  const before = JSON.parse(readFileSync('src/domain/vocabulary/resourceDictionaryRound18Baseline.json', 'utf8'));
  expect(baseline.restoreCorrections).toHaveLength(33);
  expect(baseline.restoreCorrections.every((row: any) => row.learningPriority === undefined)).toBe(true);
  // The latest previous manifest is reconstructed by reversing the priority-only batch.
  const previous = [...release.resources].filter(([url]) => url.startsWith('/vocabulary-resources/manifest.')).map(([, text]) => JSON.parse(text)).find(value =>
    value.entryTeachingResources && value.entryShards && Object.values(value.entryTeachingResources).some(url => {
      const rows = JSON.parse(release.resources.get(url as string)!).teaching.readiness.corrections;
      return rows.some((row: any) => row.senseId === 'kaikki:b1a831f5de690f1a08' && row.definition === baseline.restoreCorrections[0].definition && row.learningPriority === undefined);
    }));
  expect(previous).toBeDefined();
  const entryId = baseline.restoreCorrections[0].entryId;
  const currentRows = JSON.parse(release.resources.get(release.manifest.entryTeachingResources[release.manifest.entryShards[entryId]])!).teaching.readiness.corrections;
  expect(currentRows.find((row: any) => row.entryId === entryId && row.senseId === baseline.restoreCorrections[0].senseId).learningPriority).toBe('general');
  expect(before.removeCorrections.length).toBe(33);
  for (const url of [...Object.values(previous.entryResources), ...Object.values(previous.entryTeachingResources), ...previous.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('the light right left table batch retains the entire preceding teaching release', () => {
  const previous = JSON.parse(release.resources.get('/vocabulary-resources/manifest.ceba35ae9f9890bc.json')!);
  const light = (manifest: typeof release.manifest) => JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-a5291fb']])!).teaching;
  expect(light(previous).readiness.corrections.some((row: any) => row.entryId === 've-a5291fb')).toBe(false);
  expect(light(release.manifest).readiness.corrections.some((row: any) => row.entryId === 've-a5291fb' && row.senseId === 'kaikki:31db74460c03ff1195')).toBe(true);
  for (const url of [...Object.values(previous.entryResources), ...Object.values(previous.entryTeachingResources), ...previous.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('the common fair default preserves the preceding complete teaching release', () => {
  const previous = JSON.parse(release.resources.get('/vocabulary-resources/manifest.24951e93b8e57f5f.json')!);
  const teaching = (manifest: typeof release.manifest) => JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-7c6e1439']])!).teaching;
  expect(teaching(previous).readiness.defaults.some((row: any) => row.entryId === 've-7c6e1439')).toBe(false);
  expect(teaching(release.manifest).readiness.defaults.find((row: any) => row.entryId === 've-7c6e1439').sense.id).toBe('kaikki:437a461019b8d883c3');
  for (const url of [...Object.values(previous.entryResources), ...Object.values(previous.entryTeachingResources), ...previous.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('correcting a case-sensitive choice retains the preceding immutable teaching pack', () => {
  const preceding = JSON.parse(release.resources.get('/vocabulary-resources/manifest.6e9b003dc89eac70.json')!);
  const task = (manifest: typeof release.manifest) => JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-a672296']])!).teaching.readiness.corrections.find((row: any) => row.senseId === 'kaikki:885f1d39d5197848fe').distinctionTask;
  expect(task(preceding).options).toEqual(['AB', 'Ab']);
  expect(task(release.manifest).options).toEqual(['AB (both letters uppercase)', 'Ab (second letter lowercase)']);
});

test('the concrete fine default retains the previous complete teaching release', () => {
  const previous = JSON.parse(release.resources.get('/vocabulary-resources/manifest.b6144fe901eb7de7.json')!);
  const teaching = (manifest: typeof release.manifest) => JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-7c6e3401']])!).teaching;
  expect(teaching(previous).readiness.defaults.some((row: any) => row.entryId === 've-7c6e3401')).toBe(false);
  expect(teaching(previous).readiness.corrections.some((row: any) => row.entryId === 've-7c6e3401')).toBe(false);
  expect(teaching(release.manifest).readiness.defaults.find((row: any) => row.entryId === 've-7c6e3401').sense.definition).toBe('Of very good or excellent quality.');
  for (const url of [...Object.values(previous.entryResources), ...Object.values(previous.entryTeachingResources), ...previous.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('changing the address default preserves the preceding release and all earlier discovery resources', () => {
  const previousUrl = '/vocabulary-resources/manifest.25780c3fa8522230.json';
  const previous = JSON.parse(release.resources.get(previousUrl)!);
  const addressPack = (manifest: typeof release.manifest) => JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-4955373']])!).teaching;
  expect(addressPack(previous).readiness.defaults.some((row: any) => row.entryId === 've-4955373')).toBe(false);
  expect(addressPack(release.manifest).readiness.defaults.find((row: any) => row.entryId === 've-4955373').sense.id).toBe('wiktionary:restored:5371986fc8a7a05d49');
  for (const url of [...Object.values(previous.entryResources), ...Object.values(previous.entryTeachingResources), ...previous.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
});

test('the second dictionary batch remains intact after restoring nested meanings', () => {
  const manifestUrl = '/vocabulary-resources/manifest.a03965af94647481.json';
  expect(release.resources.has(manifestUrl)).toBe(true);
  const manifest = JSON.parse(release.resources.get(manifestUrl)!);
  for (const url of [...Object.values(manifest.entryResources), ...Object.values(manifest.entryTeachingResources), ...manifest.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
  const pack = JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-18c82a44']])!);
  expect(pack.teaching.readiness.corrections.filter((row: any) => row.entryId === 've-18c82a44')).toHaveLength(13);
  expect(pack.teaching.readiness.corrections.some((row: any) => row.dictionaryParentSenseId)).toBe(false);
});

test('the first dictionary review release retains its complete immutable teaching packs', () => {
  const manifestUrl = '/vocabulary-resources/manifest.75bcfefaa9b04417.json';
  expect(release.resources.has(manifestUrl)).toBe(true);
  const manifest = JSON.parse(release.resources.get(manifestUrl)!);
  for (const url of [...Object.values(manifest.entryResources), ...Object.values(manifest.entryTeachingResources), ...manifest.units.flatMap((unit: any) => [unit.resource, unit.teachingResource]).filter(Boolean)] as string[]) expect(release.resources.has(url), url).toBe(true);
  const bankPack = JSON.parse(release.resources.get(manifest.entryTeachingResources[manifest.entryShards['ve-7c704483']])!);
  expect(bankPack.teaching.readiness.corrections.some((row: any) => row.senseId === 'kaikki:c130710755a265600e' && row.collocations.includes('river bank'))).toBe(true);
});

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
}, 15000); // Reconstruct all retained release catalogs twice, including on slower CI hosts.

test('shared serialized sections preserve native JSON bytes in manifests and source/teaching packs', () => {
  const manifest = release.manifest;
  const unit = manifest.units.find(unit => unit.resource)!;
  const urls = [release.manifestUrl, release.teachingIndexUrl, unit.resource!, unit.teachingResource!,
    ...Object.values(manifest.entryResources), ...Object.values(manifest.entryTeachingResources)];
  for (const url of urls) {
    const text = release.resources.get(url)!;
    expect(JSON.stringify(JSON.parse(text)), url).toBe(text);
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
