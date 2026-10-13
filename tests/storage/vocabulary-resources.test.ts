import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildVocabularyResources, vocabularyResourceHeaders } from '../../scripts/vocabularyResources';

test('manifest and group packs preserve the released membership order and complete teaching content', () => {
  const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const { manifest, resources } = buildVocabularyResources(process.cwd());
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
  const generated = buildVocabularyResources(process.cwd());
  const headers = vocabularyResourceHeaders(generated.manifestUrl, generated.teachingIndexUrl);
  expect(headers).toContain(`${generated.manifestUrl}\n  Cache-Control: public, max-age=0, must-revalidate`);
  expect(headers).toContain(`${generated.teachingIndexUrl}\n  Cache-Control: public, max-age=0, must-revalidate`);
  expect(headers).toContain('/vocabulary-resources/groups/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/vocabulary-resources/entries/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/vocabulary-resources/teaching/*\n  Cache-Control: public, max-age=31536000, immutable');
});

test('resources use deterministic content-addressed URLs', () => {
  const first = buildVocabularyResources(process.cwd());
  const second = buildVocabularyResources(process.cwd());
  expect(second.manifestUrl).toBe(first.manifestUrl);
  expect(first.manifestUrl).toMatch(/manifest\.[a-f0-9]{16}\.json$/);
  for (const [url, content] of first.resources) {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    expect(url.endsWith(`.${hash}.json`)).toBe(true);
  }
});
