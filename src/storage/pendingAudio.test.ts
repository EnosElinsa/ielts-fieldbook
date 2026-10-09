import { afterEach, expect, test, vi } from 'vitest';
import { deletePendingAudio, readPendingAudio, writePendingAudio } from './pendingAudio';

afterEach(() => vi.restoreAllMocks());

test('pending audio is account scoped and degrades without an authenticated account or IndexedDB', async () => {
  const blob = new Blob(['audio'], { type: 'audio/webm' });
  await expect(writePendingAudio(null, 'topic-1', '2', blob)).resolves.toBe(false);
  await expect(readPendingAudio(null, 'topic-1', '2')).resolves.toBeNull();
  await expect(deletePendingAudio(null, 'topic-1', '2')).resolves.toBe(false);
  expect(localStorage.getItem('topic-1')).toBeNull();
});
