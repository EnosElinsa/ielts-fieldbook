// @ts-nocheck
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyState, normalizeDraft } from '../domain';
import { readDraftRecovery } from '../storage/recovery';
import { FieldbookProvider, useFieldbook } from './FieldbookContext';

const mocks = vi.hoisted(() => ({ initial: null, saveState: vi.fn(), downloadFile: vi.fn(), owner: 'account-1' }));
vi.mock('../storage', () => ({
  loadState: () => structuredClone(mocks.initial),
  hydrateState: async () => structuredClone(mocks.initial),
  saveState: (...args) => mocks.saveState(...args),
  downloadFile: (...args) => mocks.downloadFile(...args),
}));
vi.mock('../storage/remote', () => ({ accountId: () => mocks.owner }));

let fieldbook;
function Probe() { fieldbook = useFieldbook(); return null; }
async function mount() {
  render(<MemoryRouter><FieldbookProvider><Probe /></FieldbookProvider></MemoryRouter>);
  await waitFor(() => expect(fieldbook.booted).toBe(true));
}
function defer() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function prepareCompletion(skill = 'writing') {
  const question = skill === 'speaking' ? mocks.initial.speakingTopics[0] : mocks.initial.questions[0];
  await act(async () => {
    fieldbook.setPendingAttempt({ id: 'attempt-1', question, essay: 'A response that must survive.', skill, part: skill === 'speaking' ? '2' : '', practiceMode: 'full', targetErrorIds: ['target-1'] });
    fieldbook.openModal('save');
  });
}

beforeEach(() => {
  localStorage.clear();
  mocks.owner = 'account-1';
  mocks.saveState.mockReset().mockResolvedValue(true);
  mocks.downloadFile.mockReset();
  mocks.initial = emptyState();
  mocks.initial.questions = [{ id: 'q1', type: '1', name: 'Chart', prompt: 'Describe the chart.' }];
  mocks.initial.speakingTopics = [{ id: 'sp1', part: '2', title: 'A trip', cueCard: 'Describe a trip.' }];
  mocks.initial.drafts = { q1: normalizeDraft({ text: 'A response that must survive.', practiceMode: 'full' }), sp1: normalizeDraft({ transcript: 'A response that must survive.', practiceMode: 'full' }) };
});
afterEach(() => { cleanup(); vi.useRealTimers(); fieldbook = null; });

test('failed completion preserves the modal, live draft, and recovery, and retries stable error ids', async () => {
  await mount();
  await prepareCompletion();
  mocks.saveState.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const fields = { focus: 'Data', next: 'Try again', errors: 'TA-DATA incorrect figure; GRA-PREP wrong preposition' };
  await act(async () => { expect(await fieldbook.saveAttempt(true, fields)).toBe(false); });
  const first = mocks.saveState.mock.calls[0][0];
  expect(fieldbook.modal).toBe('save');
  expect(fieldbook.pendingAttempt.id).toBe('attempt-1');
  expect(fieldbook.state.sessions).toHaveLength(0);
  expect(fieldbook.state.drafts.q1.text).toBe('A response that must survive.');
  expect(readDraftRecovery('account-1')?.drafts.q1.text).toBe('A response that must survive.');
  expect(mocks.downloadFile).not.toHaveBeenCalled();
  await act(async () => { await fieldbook.saveAttempt(true, fields); });
  const second = mocks.saveState.mock.calls[1][0];
  expect(second.errors.map(error => error.id)).toEqual(first.errors.map(error => error.id));
  expect(second.errors.map(error => error.text)).toEqual(['incorrect figure', 'wrong preposition']);
  expect(fieldbook.state.sessions).toHaveLength(1);
  expect(fieldbook.state.sessions[0]).toMatchObject({ id: 'attempt-1', practiceMode: 'full', targetErrorIds: ['target-1'] });
  expect(fieldbook.state.errors).toHaveLength(2);
  expect(fieldbook.modal).toBeNull();
  expect(fieldbook.pendingAttempt).toBeNull();
  expect(readDraftRecovery('account-1')).toBeNull();
  expect(mocks.downloadFile).toHaveBeenCalledTimes(1);
});

test('delayed speaking completion cancels scheduled autosave and retains recovery until commit', async () => {
  await mount();
  vi.useFakeTimers();
  await act(async () => {
    fieldbook.setSpeakingDraft('sp1', { transcript: 'A response that must survive.', practiceMode: 'full' });
    fieldbook.scheduleDraftPersist();
  });
  await prepareCompletion('speaking');
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let completion;
  await act(async () => { completion = fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); await Promise.resolve(); });
  expect(readDraftRecovery('account-1')?.drafts.sp1.transcript).toBe('A response that must survive.');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  expect(fieldbook.state.sessions).toHaveLength(0);
  await act(async () => { pending.resolve(true); await completion; });
  expect(fieldbook.state.sessions).toHaveLength(1);
  expect(fieldbook.state.sessions[0].id).toBe('attempt-1');
  expect(fieldbook.state.drafts.sp1.transcript).toBe('');
  expect(readDraftRecovery('account-1')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
});

test('starting a targeted plan seeds the chosen draft with its mode and all target errors', async () => {
  mocks.initial.plans = [{ id: 'target-plan', kind: '1', dateKey: '2099-01-01', status: 'pending', questionId: 'q1', deskMode: 'overview', targetErrorIds: ['error-a', 'error-b'] }];
  await mount();
  await act(async () => { fieldbook.startPlan('target-plan'); });
  expect(fieldbook.state.drafts.q1).toMatchObject({ text: 'A response that must survive.', practiceMode: 'overview', targetErrorIds: ['error-a', 'error-b'] });
  expect(fieldbook.state.activePlanId).toBe('target-plan');
});

test('a newer draft edit survives a delayed completion snapshot', async () => {
  await mount();
  await prepareCompletion();
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let completion;
  await act(async () => { completion = fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); await Promise.resolve(); });
  await act(async () => {
    fieldbook.closeModal();
    fieldbook.setSpeakingDraft('sp1', { transcript: 'Newer work on another practice.' });
  });
  expect(readDraftRecovery('account-1')?.drafts.sp1.transcript).toBe('Newer work on another practice.');
  await act(async () => { pending.resolve(true); await completion; });
  expect(fieldbook.state.sessions).toHaveLength(1);
  expect(fieldbook.state.drafts.sp1.transcript).toBe('Newer work on another practice.');
});

test('queued saves keep account A work from executing after ownership changes to B', async () => {
  await mount();
  const first = defer();
  mocks.saveState.mockImplementationOnce(() => first.promise).mockResolvedValue(true);
  await act(async () => { fieldbook.persist((draft) => { draft.drafts.q1.text = 'Account A'; }); await Promise.resolve(); });
  mocks.owner = 'account-2';
  await act(async () => { fieldbook.persist((draft) => { draft.drafts.q1.text = 'Account B'; }); await Promise.resolve(); });
  await act(async () => { first.resolve(true); await Promise.resolve(); });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(2));
  expect(mocks.saveState.mock.calls[0][0].drafts.q1.text).toBe('Account A');
  expect(mocks.saveState.mock.calls[1][0].drafts.q1.text).toBe('Account B');
  expect(fieldbook.saveStatus).not.toBe('failed');
});

test('restoring a recovery draft increments the visible draft revision signal', async () => {
  writeRecovery('account-1', { q1: normalizeDraft({ text: 'Restored answer.', practiceMode: 'overview' }) });
  await mount();
  expect(fieldbook.recoveryDrafts.q1.text).toBe('Restored answer.');
  const before = fieldbook.draftRevision;
  await act(async () => { fieldbook.resolveDraftRecovery(true); });
  expect(fieldbook.draftRevision).toBe(before + 1);
  expect(fieldbook.state.drafts.q1.text).toBe('Restored answer.');
});

function writeRecovery(owner, drafts) {
  localStorage.setItem(`fieldbook-drafts-v1:${owner}`, JSON.stringify({ drafts, savedAt: new Date().toISOString() }));
}
