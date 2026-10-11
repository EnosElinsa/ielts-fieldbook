import { afterEach, expect, test, vi } from 'vitest';
import { clearPendingAudioAccount, deletePendingAudio, readPendingAudio, writePendingAudio } from './pendingAudio';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
