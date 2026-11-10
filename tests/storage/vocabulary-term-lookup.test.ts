import { afterEach, expect, test, vi } from 'vitest';
import { buildVocabularyResources } from '../../scripts/vocabularyResources';
import { lookupReleasedVocabularyTerms } from '../../src/storage/vocabularyCatalog';
import { createHash } from 'node:crypto';

afterEach(() => vi.unstubAllGlobals());
const generated = buildVocabularyResources(process.cwd());

test('adding term discovery retains the preceding manifest bytes and URL', () => {
  const { termIndexUrl, ...previous } = generated.manifest;
  const bytes = JSON.stringify(previous);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  expect(termIndexUrl).toBeTruthy();
  expect(generated.resources.get(`/vocabulary-resources/manifest.${hash}.json`)).toBe(bytes);
});
test('term lookup loads the exact published entry without unrelated entry bodies and preserves resources', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    const body = url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : generated.resources.get(url);
    return new Response(body, { status: body ? 200 : 404 });
  });
  const matches = await lookupReleasedVocabularyTerms(['LOCKER', 'never-a-published-word'], { force: true });
  expect(matches.map(row => row.term)).toEqual(['locker']);
  expect(matches[0].id).toBe('ve-54c6ba19');
  expect(urls.filter(url => url.includes('/entries/'))).toHaveLength(1);
  expect(urls.some(url => url.includes('/term-index.'))).toBe(true);
});

test('a failed term index rejects as unavailable and can be retried', async () => {
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  await expect(lookupReleasedVocabularyTerms(['locker'], { force: true })).rejects.toThrow();
  vi.stubGlobal('fetch', async (url: string) => new Response(url.endsWith('manifest.test.json') ? JSON.stringify(generated.manifest) : generated.resources.get(url)));
  expect((await lookupReleasedVocabularyTerms(['locker'], { force: true }))[0].term).toBe('locker');
});
