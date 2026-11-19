import { afterEach, expect, test, vi } from 'vitest';
import { differentDrafts, discardDraftRecovery, readDraftRecovery, writeDraftRecovery, writeDraftRecoveryEntry } from './recovery';
import { normalizeDraft } from '../domain/state';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test('editing one draft preserves unloaded recovery without rewriting every other draft', () => {
  writeDraftRecovery('account-a', { old: { text: 'Keep a long old draft' } });
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  writeDraftRecoveryEntry('account-a', 'current', { text: 'First' });
  writeDraftRecoveryEntry('account-a', 'current', { text: 'Latest' });
  expect(writes).toHaveBeenCalledTimes(2);
  expect(writes.mock.calls.every(([, payload]) => !payload.includes('Keep a long old draft'))).toBe(true);
  expect(readDraftRecovery('account-a')?.drafts).toEqual({ old: { text: 'Keep a long old draft' }, current: { text: 'Latest' } });
  expect(readDraftRecovery('account-b')).toBeNull();
});

test('an unacknowledged full snapshot retains matching entries and account discard removes both recovery formats', () => {
  writeDraftRecoveryEntry('account-a', 'current', { text: 'Old local copy' });
  writeDraftRecovery('account-a', { current: { text: 'Old local copy' } });
  expect(localStorage.getItem('fieldbook-draft-entry-v1:account-a:current')).not.toBeNull();
  expect(readDraftRecovery('account-a')?.drafts).toEqual({ current: { text: 'Old local copy' } });
  writeDraftRecoveryEntry('account-a', 'next', { text: 'Unsaved' });
  writeDraftRecoveryEntry('account-b', 'other', { text: 'Other account' });
  discardDraftRecovery('account-a');
  expect(readDraftRecovery('account-a')).toBeNull();
  expect(readDraftRecovery('account-b')?.drafts).toEqual({ other: { text: 'Other account' } });
});

test('repeated stale tab snapshots and acknowledgements preserve independent other-tab edits', () => {
  writeDraftRecoveryEntry('account-a', 'other', { text: 'Unloaded other-tab draft' });
  writeDraftRecoveryEntry('account-a', 'current', { text: 'Newer other-tab text' });
  const stale = { current: { text: 'Old saved text' } };
  for (let cycle = 0; cycle < 3; cycle++) {
    writeDraftRecovery('account-a', stale);
    discardDraftRecovery('account-a', [stale]);
    expect(readDraftRecovery('account-a')?.drafts).toEqual({ current: { text: 'Newer other-tab text' }, other: { text: 'Unloaded other-tab draft' } });
  }
});

test('a matching snapshot without a save acknowledgement cannot consume independent recovery', () => {
  const edited = { current: { text: 'Unsaved in another tab' } };
  writeDraftRecoveryEntry('account-a', 'current', edited.current);
  writeDraftRecovery('account-a', edited);
  // The matching cloud save fails or never acknowledges; a stale tab saves next.
  const stale = { current: { text: 'Old saved text' } };
  writeDraftRecovery('account-a', stale);
  discardDraftRecovery('account-a', [stale]);
  expect(readDraftRecovery('account-a')?.drafts).toEqual(edited);
  discardDraftRecovery('account-a', [edited]);
  expect(readDraftRecovery('account-a')).toBeNull();
});

test('completion acknowledgement handles legacy snapshots without consuming newer shards', () => {
  const submitted = { text: 'Submitted response' }, cleared = { text: '' };
  const legacy = { current: submitted, unrelated: { text: 'Legacy unsaved response' } };
  localStorage.setItem('fieldbook-drafts-v1:account-a', JSON.stringify({ drafts: legacy, savedAt: '2026-11-17T10:00:00Z' }));
  writeDraftRecoveryEntry('account-a', 'current', { text: 'Newer work during completion' });
  discardDraftRecovery('account-a', [{ current: submitted }, { current: cleared }]);
  expect(readDraftRecovery('account-a')?.drafts).toEqual({ current: { text: 'Newer work during completion' }, unrelated: legacy.unrelated });
  discardDraftRecovery('account-a', [{ unrelated: legacy.unrelated }]);
  const stale = { current: cleared };
  writeDraftRecovery('account-a', stale);
  discardDraftRecovery('account-a', [stale]);
  expect(readDraftRecovery('account-a')?.drafts).toEqual({ current: { text: 'Newer work during completion' } });
});

test('a newer shard arriving during a snapshot write or acknowledgement is never overwritten', () => {
  const saved = { text: 'Saved response' }, newer = { text: 'Other-tab replacement' };
  const entry = 'fieldbook-draft-entry-v1:account-a:current';
  writeDraftRecoveryEntry('account-a', 'current', saved);
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    setItem.call(this, key, value);
    if (key === 'fieldbook-drafts-v1:account-a') setItem.call(this, entry, JSON.stringify({ draft: newer, savedAt: '2026-11-17T11:00:00Z' }));
  });
  writeDraftRecovery('account-a', { current: saved });
  discardDraftRecovery('account-a', [{ current: saved }]);
  expect(readDraftRecovery('account-a')?.drafts.current).toEqual(newer);
});

test('acknowledgement cleanup retains shards and full snapshots replaced after they were read', () => {
  const saved = { text: 'Saved response' }, newer = { text: 'Other-tab replacement' };
  const entry = 'fieldbook-draft-entry-v1:account-a:current', base = 'fieldbook-drafts-v1:account-a';
  writeDraftRecoveryEntry('account-a', 'current', saved);
  writeDraftRecovery('account-a', { current: saved });
  const getItem = Storage.prototype.getItem, setItem = Storage.prototype.setItem;
  let entryReads = 0;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
    // Simulate the other tab replacing both values between capture and cleanup.
    if (key === entry && ++entryReads === 2) {
      setItem.call(this, entry, JSON.stringify({ draft: newer, savedAt: '2026-11-17T11:00:00Z' }));
      setItem.call(this, base, JSON.stringify({ drafts: { unloaded: newer }, savedAt: '2026-11-17T11:00:00Z' }));
    }
    return getItem.call(this, key);
  });
  discardDraftRecovery('account-a', [{ current: saved }]);
  expect(readDraftRecovery('account-a')?.drafts).toEqual({ current: newer, unloaded: newer });
});
test('prompt-only recovery remains available with identity and parent metadata', () => {
  const local = { topic: normalizeDraft({ responses: { key: { promptKey: 'key', promptText: 'A question', promptIndex: 2, part: '3', transcript: 'Saved locally', parentSessionId: 'parent', targetErrorIds: ['error'] } } }) };
  expect(differentDrafts(local, {})).toEqual(local);
  expect(differentDrafts(local, local)).toEqual({});
});
