import { beforeEach, expect, test, vi } from 'vitest';
import { signOut } from './AuthGate';
const m = vi.hoisted(() => ({ owner: 'account-a', authSignOut: vi.fn(), reset: vi.fn(), discard: vi.fn(), vocabulary: vi.fn(), exam: vi.fn(), audio: vi.fn().mockResolvedValue(true) }));
vi.mock('../lib/supabase', () => ({ supabaseConfigured: () => true, getSupabase: () => ({ auth: { signOut: m.authSignOut } }) }));
vi.mock('../storage/remote', () => ({ accountId: () => m.owner, resetAccountStore: m.reset }));
vi.mock('../storage/recovery', () => ({ discardDraftRecovery: m.discard }));
vi.mock('../storage/vocabularyDrafts', () => ({ clearVocabularyDraft: m.vocabulary }));
vi.mock('../storage/examRecovery', () => ({ clearAccountExamRecovery: m.exam }));
vi.mock('../storage/pendingAudio', () => ({ clearPendingAudioAccount: m.audio }));
beforeEach(() => { vi.clearAllMocks(); m.owner = 'account-a'; m.authSignOut.mockResolvedValue({ error: null }); });
test('sign out clears the captured owner’s recovery and pending recordings even if account state resets during auth', async () => {
  m.authSignOut.mockImplementation(async () => { m.owner = ''; return { error: null }; });
  await signOut();
  expect(m.discard).toHaveBeenCalledWith('account-a');
  expect(m.vocabulary).toHaveBeenCalledWith('account-a');
  expect(m.exam).toHaveBeenCalledWith('account-a');
  expect(m.audio).toHaveBeenCalledWith('account-a');
  expect(m.reset).toHaveBeenCalledOnce();
});
test('failed sign out preserves recoverable recordings and drafts', async () => {
  m.authSignOut.mockResolvedValue({ error: new Error('offline') });
  await expect(signOut()).rejects.toThrow('offline');
  expect(m.audio).not.toHaveBeenCalled();
  expect(m.exam).not.toHaveBeenCalled();
  expect(m.reset).not.toHaveBeenCalled();
});
