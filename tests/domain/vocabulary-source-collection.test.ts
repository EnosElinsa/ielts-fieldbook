import { expect, test } from 'vitest';
import { collectRevisionSources } from '../../scripts/vocabulary-source-collection';

const work = (term: string) => ({ term, originalSense: { sourceUrl: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(term) + '#English' } });
const page = (title: string, revid = 123) => ({ title, revisions: [{ revid, slots: { main: { '*': '==English==\n===Noun===\n# Test meaning.' } } }] });
const response = (...pages: unknown[]) => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } });

test('source collection reuses exact titles, records absent pages and only retries unresolved requests', async () => {
  const calls: string[][] = [], saved: unknown[] = [];
  const items = [work('bank'), work('bank'), work('Bank'), work('missing'), { term: 'custom phrase', originalSense: null }];
  const output = await collectRevisionSources(items, [response(page('bank'))], async titles => {
    calls.push([...titles]);
    return response(...titles.map(title => title === 'missing' ? { title, missing: '' } : page(title)));
  }, { batchSize: 2, onResponse: value => { saved.push(value); } });
  expect(calls).toEqual([['Bank', 'missing'], ['custom phrase']]);
  expect(saved).toHaveLength(2);
  expect(output).toMatchObject({ requested: 4, available: 3, reused: 1, unavailable: ['missing'], unresolved: [], conflictingTitles: [], failures: [] });
  const resumed = await collectRevisionSources(items, output.responses, async () => { throw new Error('Must use cache'); });
  expect(resumed).toMatchObject({ requested: 4, available: 3, reused: 4, unavailable: ['missing'], unresolved: [], failures: [] });
});

test('partial replies and network failures preserve successes and retry only missing titles', async () => {
  const calls: string[][] = [], saved: unknown[] = [];
  const output = await collectRevisionSources([work('a'), work('b')], [], async titles => {
    calls.push([...titles]);
    if (calls.length === 1) return response(page('a'));
    if (calls.length === 2) throw new Error('temporary');
    return response(page('b'));
  }, { attempts: 3, onResponse: value => { saved.push(value); } });
  expect(calls).toEqual([['a', 'b'], ['b'], ['b']]);
  expect(saved).toHaveLength(2);
  expect(output).toMatchObject({ available: 2, unresolved: [], failures: [] });
  const failed = await collectRevisionSources([work('a'), work('b')], [], async () => response(page('a')), { attempts: 2 });
  expect(failed.available).toBe(1);
  expect(failed.unresolved).toEqual(['b']);
  expect(failed.failures).toEqual([{ titles: ['b'], error: 'Source response did not resolve every requested title.' }]);
});

test('conflicting revisions remain explicit and cannot be replaced by whichever cache file was read last', async () => {
  const cached = [response(page('bank', 124)), response(page('bank', 123)), response(page('bank', 124)), response({ title: 'bank', missing: '' })];
  const output = await collectRevisionSources([work('bank')], cached, async () => { throw new Error('Must use cache'); });
  expect(output).toMatchObject({ available: 1, reused: 1, unavailable: [], unresolved: [], conflictingTitles: ['bank'] });
  const pages = Object.values(output.responses[0].query.pages) as ReturnType<typeof page>[];
  expect(pages.map(row => row.revisions[0].revid).sort()).toEqual([123, 124]);
});

test('invalid evidence is not a successful collection and invalid options fail without requesting', async () => {
  const request = async () => response({ title: 'bank', revisions: [{ revid: 0 }] });
  const result = await collectRevisionSources([work('bank')], [], request, { attempts: 1 });
  expect(result).toMatchObject({ available: 0, unresolved: ['bank'] });
  for (const options of [{ batchSize: 0 }, { batchSize: 51 }, { attempts: 0 }, { attempts: 6 }]) {
    await expect(collectRevisionSources([], [], request, options)).rejects.toThrow();
  }
});

test('a later source collection can refresh absent pages while retaining valid cached revisions', async () => {
  const calls: string[][] = [];
  const output = await collectRevisionSources([work('bank'), work('new page')], [response(page('bank'), { title: 'new page', missing: '' })], async titles => {
    calls.push(titles); return response(page('new page'));
  }, { refreshMissing: true });
  expect(calls).toEqual([['new page']]);
  expect(output).toMatchObject({ requested: 2, reused: 1, available: 2, unavailable: [], unresolved: [] });
});
