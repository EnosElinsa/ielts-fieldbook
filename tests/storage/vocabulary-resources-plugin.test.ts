import { expect, test } from 'vitest';
import { buildVocabularyResources, vocabularyResourcesPlugin } from '../../scripts/vocabularyResources';

test('current-only vocabulary resource build emits the full current manifest and teaching packs without historical archives', () => {
  const current = buildVocabularyResources(process.cwd(), { includeHistory: false });
  expect(current.manifestUrl).toMatch(/^\/vocabulary-resources\/manifest\.[a-f0-9]{16}\.json$/);
  expect(current.teachingIndexUrl).toMatch(/^\/vocabulary-resources\/teaching-index\.[a-f0-9]{16}\.json$/);
  expect(current.resources.size).toBeLessThan(600);
  expect(current.resources.has(current.manifestUrl)).toBe(true);
  expect(current.resources.has(current.teachingIndexUrl)).toBe(true);
  expect(current.manifest.termIndexUrl).toBeTruthy();
  expect(current.resources.has(current.manifest.termIndexUrl!)).toBe(true);
  for (const url of [
    ...Object.values(current.manifest.entryResources),
    ...Object.values(current.manifest.entryTeachingResources),
    ...current.manifest.units.flatMap(unit => [unit.resource, unit.teachingResource]).filter(Boolean),
  ] as string[]) {
    expect(current.resources.has(url), url).toBe(true);
  }
});

test('vocabularyResourcesPlugin serves current resources in dev mode with expected cache headers', () => {
  const plugin = vocabularyResourcesPlugin(process.cwd());
  (plugin.configResolved as (config: { command: string }) => void)({ command: 'serve' });
  (plugin.buildStart as () => void)();
  const virtualModule = (plugin.load as (id: string) => string)('\0virtual:vocabulary-manifest');
  const manifestMatch = /export default "([^"]+)"/.exec(virtualModule);
  expect(manifestMatch?.[1]).toMatch(/^\/vocabulary-resources\/manifest\.[a-f0-9]{16}\.json$/);

  let middleware: ((req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (body: Buffer) => void }, next: () => void) => void) | undefined;
  (plugin.configureServer as (server: { middlewares: { use: (fn: typeof middleware) => void } }) => void)({
    middlewares: { use(fn) { middleware = fn; } },
  });
  expect(middleware).toBeDefined();

  const headers: Record<string, string> = {};
  let body: Buffer | undefined;
  let passedNext = false;
  middleware!(
    { url: manifestMatch![1] },
    { setHeader(k, v) { headers[k] = v; }, end(b) { body = b; } },
    () => { passedNext = true; },
  );
  expect(passedNext).toBe(false);
  expect(headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
  expect(headers['Content-Type']).toBe('application/json; charset=utf-8');
  expect(JSON.parse(body!.toString('utf8')).version).toBe(1);

  let nonVocabNext = false;
  middleware!(
    { url: '/assets/index.js' },
    { setHeader() {}, end() {} },
    () => { nonVocabNext = true; },
  );
  expect(nonVocabNext).toBe(true);

  const historicHeaders: Record<string, string> = {};
  let historicBody: Buffer | undefined;
  let historicNext = false;
  middleware!(
    { url: '/vocabulary-resources/manifest.3ce90c4c5b58aa11.json' },
    { setHeader(k, v) { historicHeaders[k] = v; }, end(b) { historicBody = b; } },
    () => { historicNext = true; },
  );
  expect(historicNext).toBe(false);
  expect(historicHeaders['Cache-Control']).toBe('public, max-age=31536000, immutable');
  expect(JSON.parse(historicBody!.toString('utf8')).version).toBe(1);

  let missingNext = false;
  middleware!(
    { url: '/vocabulary-resources/does-not-exist.json' },
    { setHeader() {}, end() {} },
    () => { missingNext = true; },
  );
  expect(missingNext).toBe(true);
}, 60_000);
