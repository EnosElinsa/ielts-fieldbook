import { expect, test } from 'vitest';
import { historicalCatalogRequests } from './sessionHydration';

const row = (entryId: string, context?: { bookId?: string; unitId?: string }) => ({ cardId: `${entryId}:dictation`, entryId, senseId: 's', term: entryId, expectedAnswer: entryId, response: '', result: 'success' as const, definition: '', example: '', ...(context ? { context: { entryId, senseId: 's', version: 'v', status: 'reviewed' as const, ...context } } : {}) });
const base = { filter: {}, entryIds: [] as string[], results: [] as ReturnType<typeof row>[] };

test('session book and group cover record.entryIds and unframed rows', () => {
  expect(historicalCatalogRequests({ ...base, selection: { kind: 'unit', bookId: 'b', unitId: 'u' } as any, entryIds: ['a'], results: [row('a'), row('c')] }))
    .toEqual([{ bookId: 'b', unitId: 'u', entryIds: ['a', 'c'] }]);
});

test('rows frozen with their own context are read from that group; others fall back to the session scope', () => {
  const requests = historicalCatalogRequests({ ...base, selection: { kind: 'review' } as any, entryIds: ['a', 'b', 'c'], results: [row('a', { bookId: 'b1', unitId: 'u1' }), row('b', { bookId: 'b2' }), row('c')] });
  expect(requests).toEqual([
    { entryIds: ['c'] },
    { bookId: 'b1', unitId: 'u1', entryIds: ['a'] },
    { bookId: 'b2', entryIds: ['b'] },
  ]);
});

test('a word tested in both session scope and its own group is read from both', () => {
  const requests = historicalCatalogRequests({ ...base, filter: { bookId: 'b', unitId: 'all' }, entryIds: ['a'], results: [row('a'), row('a', { bookId: 'other', unitId: 'x' })] });
  expect(requests).toEqual([{ bookId: 'b', entryIds: ['a'] }, { bookId: 'other', unitId: 'x', entryIds: ['a'] }]);
});

test('frozen card snapshots and missing record.entryIds still hydrate, and empty sessions request nothing', () => {
  expect(historicalCatalogRequests({ ...base, entryIds: undefined as any, cardSnapshots: [{ entryId: 'z' } as any] })).toEqual([{ entryIds: ['z'] }]);
  expect(historicalCatalogRequests(base)).toEqual([]);
  expect(historicalCatalogRequests({ ...base, filter: { bookId: 'all', unitId: 'all' }, entryIds: ['a', 'a'] })).toEqual([{ entryIds: ['a'] }]);
});
