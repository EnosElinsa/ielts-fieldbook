import { beforeEach, expect, test } from 'vitest';
import { readDraftRecovery, writeDraftRecovery, discardDraftRecovery, differentDrafts } from '../../src/storage/recovery';

beforeEach(() => localStorage.clear());
test('draft recovery is isolated by account and preserves unsynced text', () => {
  writeDraftRecovery('alice', { q1: { text: 'unsynced answer' } });
  expect(readDraftRecovery('bob')).toBeNull();
  expect(readDraftRecovery('alice')?.drafts.q1).toEqual({ text: 'unsynced answer' });
  discardDraftRecovery('alice');
  expect(readDraftRecovery('alice')).toBeNull();
});
test('recovery offers only different nonempty drafts', () => {
  expect(differentDrafts({ q: { text: 'local' }, blank: { text: '' } }, { q: { text: 'remote' } })).toEqual({ q: { text: 'local' } });
  expect(differentDrafts({ q: { text: 'same' } }, { q: { text: 'same' } })).toEqual({});
});
