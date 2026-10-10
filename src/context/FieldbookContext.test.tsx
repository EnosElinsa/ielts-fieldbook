// @ts-nocheck
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyState, normalizeDraft } from '../domain';
import { readDraftRecovery } from '../storage/recovery';
import { FieldbookProvider, useFieldbook } from './FieldbookContext';

const mocks = vi.hoisted(() => ({ initial: null, saveState: vi.fn(), saveVocabularyImport: vi.fn(), saveVocabularySession:vi.fn(), downloadFile: vi.fn(), owner: 'account-1' }));
vi.mock('../storage', () => ({
  loadState: () => structuredClone(mocks.initial),
  hydrateState: async () => structuredClone(mocks.initial),
  saveState: (...args) => mocks.saveState(...args),
  saveVocabularyImport: (...args) => mocks.saveVocabularyImport(...args),
  saveVocabularySession: (...args) => mocks.saveVocabularySession(...args),
  loadVocabularyCatalog: vi.fn(async () => ({ entries: [], books: [], units: [], memberships: [], nextOffset: null })),
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
  mocks.saveVocabularyImport.mockReset().mockResolvedValue(true);
  mocks.saveVocabularySession.mockReset().mockResolvedValue(true);
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

test('study settings failure keeps live settings and pending plans unchanged', async () => {
  mocks.initial.plans = [{ id: 'old-pending', status: 'pending', kind: '1' }, { id: 'started', status: 'in_progress', kind: '2' }];
  await mount();
  const original = structuredClone(fieldbook.state.settings);
  const originalPlans = structuredClone(fieldbook.state.plans);
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async () => { expect(await fieldbook.saveStudySettings({ dailyMinutes: 45, vocabulary: { accent: 'us' } })).toBe(false); });
  expect(fieldbook.state.settings).toEqual(original);
  expect(fieldbook.state.plans).toEqual(originalPlans);
});

test('queued study edits merge current preferences and preserve untouched settings', async () => {
  await mount();
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let preferenceSave;
  let studySave;
  await act(async () => {
    preferenceSave = fieldbook.saveVocabularyPreferences({ accent: 'us' });
    await Promise.resolve();
    studySave = fieldbook.saveStudySettings({ dailyMinutes: 45 });
  });
  await act(async () => { pending.resolve(true); await preferenceSave; await studySave; });
  expect(mocks.saveState.mock.calls.at(-1)[0].settings).toMatchObject({ dailyMinutes: 45, vocabulary: { accent: 'us' } });
  expect(fieldbook.state.settings.vocabulary.accent).toBe('us');
});

test('combined settings commit survives a queued writing autosave and preserves live drafts', async () => {
  await mount();
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let settingsSave;
  let draftSave;
  await act(async () => { settingsSave = fieldbook.saveStudySettings({ dailyMinutes: 45, vocabulary: { accent: 'us' } }); await Promise.resolve(); });
  await act(async () => { draftSave = fieldbook.persist((draft) => { draft.drafts.q1.text = 'Written during settings save.'; }); await Promise.resolve(); });
  await act(async () => { pending.resolve(true); await settingsSave; await draftSave; });
  expect(mocks.saveState.mock.calls.at(-1)[0].settings).toMatchObject({ dailyMinutes: 45, vocabulary: { accent: 'us' } });
  expect(fieldbook.state.settings).toMatchObject({ dailyMinutes: 45, vocabulary: { accent: 'us' } });
  expect(fieldbook.state.drafts.q1.text).toBe('Written during settings save.');
});

test('later edits to rebuilt pending plans survive settings replay and reload', async () => {
  await mount();
  await act(async () => { expect(await fieldbook.saveStudySettings({ dailyMinutes: 45 })).toBe(true); });
  const planId = fieldbook.state.plans.find(plan => plan.status === 'pending').id;
  await act(async () => {
    const next = structuredClone(fieldbook.stateRef.current);
    const plan = next.plans.find(row => row.id === planId);
    plan.title = 'Updated after assessment';
    plan.driver = { type: 'assessment', id: 'feedback-1' };
    expect(await fieldbook.persistNow(next)).toBe(true);
  });
  const saved = mocks.saveState.mock.calls.at(-1)[0];
  expect(saved.plans.find(plan => plan.id === planId)).toMatchObject({ title: 'Updated after assessment', driver: { type: 'assessment', id: 'feedback-1' } });
  mocks.initial = structuredClone(saved);
  cleanup();
  await mount();
  expect(fieldbook.state.plans.find(plan => plan.id === planId)).toMatchObject({ title: 'Updated after assessment', driver: { type: 'assessment', id: 'feedback-1' } });
});

test('same-id plans started while settings save is pending retain their progress', async () => {
  await mount();
  const planId = fieldbook.state.plans.find(plan => plan.status === 'pending').id;
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let settingsSave;
  await act(async () => { settingsSave = fieldbook.saveStudySettings({ dailyMinutes: 45 }); await Promise.resolve(); });
  await act(async () => { fieldbook.persist(draft => { const plan = draft.plans.find(row => row.id === planId); plan.status = 'in_progress'; plan.title = 'Started task'; draft.activePlanId = planId; }); await Promise.resolve(); });
  await act(async () => { pending.resolve(true); await settingsSave; });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(2));
  expect(mocks.saveState.mock.calls.at(-1)[0].plans.find(plan => plan.id === planId)).toMatchObject({ status: 'in_progress', title: 'Started task' });
  expect(fieldbook.state.activePlanId).toBe(planId);
});

test('settings save finishing after account change cannot commit or report success', async () => {
  await mount();
  const original = structuredClone(fieldbook.state.settings);
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let settingsSave;
  await act(async () => { settingsSave = fieldbook.saveStudySettings({ dailyMinutes: 45 }); await Promise.resolve(); });
  mocks.owner = 'account-2';
  await act(async () => { pending.resolve(true); expect(await settingsSave).toBe(false); });
  expect(fieldbook.state.settings).toEqual(original);
});

test('vocabulary settings save finishing after account change cannot report success', async () => {
  await mount();
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  let preferenceSave;
  await act(async () => { preferenceSave = fieldbook.saveVocabularyPreferences({ accent: 'us' }); await Promise.resolve(); });
  mocks.owner = 'account-2';
  await act(async () => { pending.resolve(true); expect(await preferenceSave).toBe(false); });
});

test('a delayed vocabulary import preserves concurrent drafts and queued saves', async () => {
  await mount();
  const pending = defer();
  mocks.saveVocabularyImport.mockImplementationOnce(() => pending.promise);
  const imported = structuredClone(fieldbook.stateRef.current);
  imported.vocabularyImportBatches.push({ id: 'import-1' });
  imported.vocabulary.push({ id: 'word-1', term: 'mitigate', senses: [], sources: [] });
  let completion;
  await act(async () => { completion = fieldbook.persistVocabularyImport(imported, 'import-1'); await Promise.resolve(); });
  await act(async () => { fieldbook.persist(draft => { draft.drafts.q1.text = 'Work written during import.'; }); await Promise.resolve(); });
  await act(async () => { pending.resolve(true); await completion; });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalled());
  expect(fieldbook.state.drafts.q1.text).toBe('Work written during import.');
  expect(mocks.saveState.mock.calls.at(-1)[0].vocabulary[0].term).toBe('mitigate');
});

test('a failed session commit keeps live learning unchanged and can retry the prepared batch',async()=>{
  await mount();
  const draft=structuredClone(fieldbook.stateRef.current);
  draft.vocabularySessions.push({id:'session-batch',status:'submitted'});
  mocks.saveVocabularySession.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(async()=>{expect(await fieldbook.persistVocabularySession(draft,'session-batch')).toBe(false)});
  expect(fieldbook.state.vocabularySessions).toHaveLength(0);
  await act(async()=>{expect(await fieldbook.persistVocabularySession(draft,'session-batch')).toBe(true)});
  expect(fieldbook.state.vocabularySessions).toHaveLength(1);
  expect(mocks.saveVocabularySession.mock.calls[0][1]).toBe(mocks.saveVocabularySession.mock.calls[1][1]);
});

test('practice preference save retains an in-progress writing draft and pending plans',async()=>{
  await mount();const pending=structuredClone(fieldbook.state.plans);
  await act(async()=>{expect(await fieldbook.saveVocabularyPreferences({layout:'cards',volume:0.6})).toBe(true)});
  expect(fieldbook.state.settings.vocabulary.layout).toBe('cards');
  expect(fieldbook.state.settings.vocabulary.volume).toBe(0.6);
  expect(fieldbook.state.drafts.q1.text).toBe('A response that must survive.');
  expect(fieldbook.state.plans).toEqual(pending);
});

test('queued writing autosave retains newly committed practice preferences', async () => {
  await mount();
  const pending = defer();
  mocks.saveState.mockImplementationOnce(() => pending.promise).mockResolvedValue(true);
  let saving;
  await act(async () => { saving = fieldbook.saveVocabularyPreferences({ accent: 'us' }); await Promise.resolve(); });
  await act(async () => { fieldbook.persist(draft => { draft.drafts.q1.text = 'Written during settings save.'; }); await Promise.resolve(); });
  await act(async () => { pending.resolve(true); await saving; });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(2));
  expect(mocks.saveState.mock.calls[1][0].settings.vocabulary.accent).toBe('us');
  expect(mocks.saveState.mock.calls[1][0].drafts.q1.text).toBe('Written during settings save.');
});

test('an explicit preference change can restore the original accent', async () => {
  await mount();
  await act(async () => { await fieldbook.saveVocabularyPreferences({ accent: 'us' }); });
  await act(async () => { await fieldbook.saveVocabularyPreferences({ accent: 'uk' }); });
  expect(mocks.saveState.mock.calls.at(-1)[0].settings.vocabulary.accent).toBe('uk');
});
