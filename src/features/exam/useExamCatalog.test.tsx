import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { clearReadCache } from '../../lib/readCache';
import { examAssetKey, EXAM_ASSET_REFRESH_MS, loadExamCatalog } from '../../storage/examCatalog';
import { resetAccountIdentity } from '../../storage/accountIdentity';
import { useExamAsset, useExamCatalog } from './useExamCatalog';
import { cachedRead } from '../../lib/readCache';
import type { ExamAsset } from '../../domain/exam/types';

vi.mock('../../lib/supabase', () => ({ supabaseConfigured: () => false }));
const metadata = { schemaVersion: 1, papers: [{ id: 'p', book: 0, title: 'Original demo' }], sections: [], passages: [], questions: [], assets: [] };
let now = 1_000_000;
beforeEach(() => { clearReadCache(); resetAccountIdentity(); now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('a revisited catalog is visible on the first render without a loading screen', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal('fetch', fetcher);
  await loadExamCatalog('reading', 0);
  const { result } = renderHook(() => useExamCatalog('reading', 0));
  expect(result.current.catalog.papers[0].id).toBe('p');
  expect(result.current.loading).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('background refresh failure keeps stale catalog and reload retries with fresh content', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => metadata })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...metadata, papers: [{ ...metadata.papers[0], title: 'Updated demo' }] }) });
  vi.stubGlobal('fetch', fetcher);
  await loadExamCatalog('reading', 0);
  now += 300_001;
  const { result } = renderHook(() => useExamCatalog('reading', 0));
  await waitFor(() => expect(result.current.error).toBe('offline'));
  expect(result.current.catalog.papers[0].id).toBe('p');
  expect(result.current.loading).toBe(false);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.catalog.papers[0].title).toBe('Updated demo'));
  expect(result.current.error).toBe('');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('asset hooks never show another asset URL or an expired cached URL', async () => {
  const asset = { id: 'a', paperId: 'p', kind: 'audio', storagePath: 'demo/a.mp3', sourceUrl: '' } as ExamAsset;
  const otherAsset = { ...asset, id: 'b', storagePath: 'demo/b.mp3' };
  await cachedRead(examAssetKey(asset), async () => '/cached-a');
  const { result, rerender } = renderHook(({ selected }) => useExamAsset(selected), { initialProps: { selected: asset } });
  expect(result.current.url).toBe('/cached-a');
  rerender({ selected: otherAsset });
  expect(result.current.url).not.toBe('/cached-a');
  await waitFor(() => expect(result.current.url).toBe('/demo/b.mp3'));
  now += EXAM_ASSET_REFRESH_MS;
  rerender({ selected: asset });
  expect(result.current.url).toBe('');
  await waitFor(() => expect(result.current.url).toBe('/demo/a.mp3'));
});
