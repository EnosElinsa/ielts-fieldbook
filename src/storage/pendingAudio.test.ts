import { afterEach, expect, test, vi } from 'vitest';
import { clearPendingAudioAccount, deletePendingAudio, readPendingAudio, writePendingAudio } from './pendingAudio';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('pending audio uses independent prompt keys and retains the legacy unassociated record', async () => {
  const rows = new Map();
  vi.stubGlobal('indexedDB', { open: () => {
    const db = { close: vi.fn(), transaction: () => {
      const tx: any = { objectStore: () => ({
        put: (value: any) => { rows.set(value.key, value); queueMicrotask(() => tx.oncomplete()); },
        delete: (key: string) => { rows.delete(key); queueMicrotask(() => tx.oncomplete()); },
        get: (key: string) => { const request: any = {}; queueMicrotask(() => { request.result = rows.get(key); request.onsuccess(); }); return request; },
      }) }; return tx;
    } };
    const request: any = { result: db }; queueMicrotask(() => request.onsuccess()); return request;
  } });
  const legacy = new Blob(['legacy']); const first = new Blob(['first']); const second = new Blob(['second']);
  await writePendingAudio('owner', 'topic', '1', legacy);
  await writePendingAudio('owner', 'topic', '1', first, 'first-prompt');
  await writePendingAudio('owner', 'topic', '1', second, 'second-prompt');
  expect(await readPendingAudio('owner', 'topic', '1', 'first-prompt')).toBe(first);
  expect(await readPendingAudio('owner', 'topic', '1', 'second-prompt')).toBe(second);
  await deletePendingAudio('owner', 'topic', '1', 'first-prompt');
  expect(await readPendingAudio('owner', 'topic', '1')).toBe(legacy);
  expect(await readPendingAudio('other-owner', 'topic', '1', 'second-prompt')).toBeNull();
});

test('pending audio is account scoped and degrades without an authenticated account or IndexedDB', async () => {
  const blob = new Blob(['audio'], { type: 'audio/webm' });
  await expect(writePendingAudio(null, 'topic-1', '2', blob)).resolves.toBe(false);
  await expect(readPendingAudio(null, 'topic-1', '2')).resolves.toBeNull();
  await expect(deletePendingAudio(null, 'topic-1', '2')).resolves.toBe(false);
  expect(localStorage.getItem('topic-1')).toBeNull();
});

test('account deletion removes speaking and intensive pending audio without touching other accounts', async () => {
  const rows = new Map([['a-speaking', { accountId: 'a', topicId: 'speaking' }], ['a-intensive', { accountId: 'a', topicId: 'intensive:part' }], ['b-intensive', { accountId: 'b', topicId: 'intensive:part' }]]);
  const close = vi.fn();
  const request: any = { result: null, onsuccess: null };
  const tx: any = { oncomplete: null, onerror: null, onabort: null, objectStore: () => ({ openCursor: () => request }) };
  const db = { close, transaction: () => tx };
  vi.stubGlobal('indexedDB', { open: () => {
    const opening: any = { result: db, onsuccess: null };
    queueMicrotask(() => {
      opening.onsuccess();
      const entries = [...rows.entries()]; let index = 0;
      const advance = () => {
        const entry = entries[index++];
        request.result = entry ? { value: entry[1], delete: () => rows.delete(entry[0]), continue: () => queueMicrotask(advance) } : null;
        request.onsuccess();
        if (!entry) tx.oncomplete();
      };
      queueMicrotask(advance);
    });
    return opening;
  } });
  await expect(clearPendingAudioAccount('a')).resolves.toBe(true);
  expect([...rows.keys()]).toEqual(['b-intensive']);
  expect(close).toHaveBeenCalledOnce();
  await expect(clearPendingAudioAccount(null)).resolves.toBe(false);
});
