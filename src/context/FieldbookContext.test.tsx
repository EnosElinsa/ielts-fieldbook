// @ts-nocheck
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyState, normalizeDraft } from '../domain';
import { addVocabularyItem, recordVocabularyReview } from '../domain/vocabulary';
import { readDraftRecovery } from '../storage/recovery';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { FieldbookProvider, useFieldbook } from './FieldbookContext';

const mocks = vi.hoisted(() => ({ initial: null, statuses: null, moduleRead: vi.fn(), releasedRead: vi.fn(), teachingRead: vi.fn(), saveState: vi.fn(), saveVocabularyImport: vi.fn(), saveVocabularySession:vi.fn(), catalogRead: vi.fn(), examCatalogRead:vi.fn(), examSectionsRead:vi.fn(), downloadFile: vi.fn(), owner: 'account-1' }));
vi.mock('../storage/examCatalog',()=>({loadExamCatalog:(...args)=>mocks.examCatalogRead(...args),loadExamSections:(...args)=>mocks.examSectionsRead(...args)}));
vi.mock('../storage', () => ({
  loadState: () => structuredClone(mocks.initial),
  hydrateState: async () => structuredClone(mocks.initial),
  saveState: (...args) => mocks.saveState(...args),
  saveVocabularyImport: (...args) => mocks.saveVocabularyImport(...args),
  saveVocabularySession: (...args) => mocks.saveVocabularySession(...args),
  loadVocabularyCatalog: (...args) => mocks.catalogRead(...args),
  downloadFile: (...args) => mocks.downloadFile(...args),
  getCollectionStatuses: () => mocks.statuses,
  ensureAccountModule: (...args) => mocks.moduleRead(...args),
  ensureCompleteAccount: async () => structuredClone(mocks.initial),
  ensureQuestionBank: async skill => structuredClone(skill === 'writing' ? mocks.initial.questions : mocks.initial.speakingTopics),
  ensureSpeakingSample: async () => null,
  subscribeQuestionBank: () => () => {},
}));
vi.mock('../storage/vocabularyCatalog', () => ({
  loadReleasedVocabulary: (...args) => mocks.releasedRead(...args),
  loadReleasedVocabularyTeaching: (...args) => mocks.teachingRead(...args),
  VocabularyScopeUnavailableError: class extends Error {},
}));
vi.mock('../storage/remote', () => ({ accountId: () => mocks.owner }));

let fieldbook;
let currentPath;
function Probe() { fieldbook = useFieldbook(); currentPath = useLocation().pathname + useLocation().search; return null; }
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
  mocks.statuses = null;
  mocks.moduleRead.mockReset().mockImplementation(async () => ({data: {}, statuses: {}}));
  mocks.releasedRead.mockReset().mockRejectedValue(new Error('Static resource unavailable'));
  mocks.teachingRead.mockReset().mockResolvedValue({books:[], units:[], entries:[], memberships:[]});
  mocks.saveState.mockReset().mockResolvedValue(true);
  mocks.downloadFile.mockReset();
  mocks.saveVocabularyImport.mockReset().mockResolvedValue(true);
  mocks.saveVocabularySession.mockReset().mockResolvedValue(true);
  mocks.catalogRead.mockReset().mockResolvedValue({ entries: [], books: [], units: [], memberships: [], nextOffset: null });
  mocks.examCatalogRead.mockReset().mockImplementation(async(skill)=>({sections:[{id:'part',skill,status:'ready'}]}));
  mocks.examSectionsRead.mockReset().mockResolvedValue({sections:[{id:'part',skill:'reading',status:'ready',sentences:[{id:'sentence'}]}],questions:[{id:'q',sectionId:'part'}]});
  mocks.initial = emptyState();
  mocks.initial.questions = [{ id: 'q1', type: '1', name: 'Chart', prompt: 'Describe the chart.' },{id:'q2',type:'2',name:'Education',prompt:'Discuss education.'}];
  mocks.initial.speakingTopics = [{ id: 'sp1', part: '2', title: 'A trip', cueCard: 'Describe a trip.' },{id:'sp2',part:'1',title:'Home'}];
  mocks.initial.drafts = { q1: normalizeDraft({ text: 'A response that must survive.', practiceMode: 'full' }), sp1: normalizeDraft({ transcript: 'A response that must survive.', practiceMode: 'full' }) };
});
afterEach(() => { cleanup(); vi.useRealTimers(); fieldbook = null; });

test('base hydration opens workspace without loading account modules and later module load keeps live settings', async () => {
  mocks.statuses = { profile: 'ready', plans: 'ready', drafts: 'ready', sessions: 'unloaded', vocabulary: 'unloaded', examAttempts: 'unloaded' };
  const pending = defer();
  mocks.moduleRead.mockImplementation(() => pending.promise);
  await mount();
  expect(mocks.moduleRead).not.toHaveBeenCalled();
  let request;
  await act(async () => { request = fieldbook.ensureAccountModule('productive'); });
  await act(async () => { fieldbook.persist(draft => { draft.settings.dailyMinutes = 75; }); });
  await act(async () => { pending.resolve({ data: { sessions: [{id:'late', essay:'Loaded history'}], assessments: [], errors: [], stories: [] }, statuses: {} }); await request; });
  expect(fieldbook.state.settings.dailyMinutes).toBe(75);
  expect(fieldbook.state.sessions[0].id).toBe('late');
  expect(fieldbook.moduleStatus.productive).toBe('ready');
});

test('pending module results cannot merge into a different account', async () => {
  mocks.statuses = { sessions: 'unloaded', vocabulary: 'unloaded', examAttempts: 'unloaded' };
  const pending = defer(); mocks.moduleRead.mockImplementation(() => pending.promise);
  await mount(); let request;
  await act(async () => { request = fieldbook.ensureAccountModule('productive').catch(() => false); });
  mocks.owner = 'account-2';
  await act(async () => { pending.resolve({data:{sessions:[{id:'account-1-only'}]},statuses:{}}); await request; });
  expect(fieldbook.state.sessions.some(row=>row.id==='account-1-only')).toBe(false);
});

test('reading and due listening plans open their own workspaces and save linked completion', async () => {
  mocks.initial.plans = [{ id: 'reading-plan', kind: 'reading-practice', status: 'pending' }, { id: 'listening-plan', kind: 'listening-intensive', status: 'pending', sectionId: 'part', sentenceId: 'sentence' }];
  await mount();
  await act(async () => { await fieldbook.startPlan('reading-plan'); });
  expect(currentPath).toBe('/reading/part?planId=reading-plan&questions=%5B%22q%22%5D');
  expect(fieldbook.state.settings.activeSkill).toBe('reading');
  const now = new Date().toISOString();
  await act(async () => {
    const draft = structuredClone(fieldbook.stateRef.current);
    draft.examAttempts.push({ id: 'exam', planId:'reading-plan', skill: 'reading', mode:'practice', status: 'completed', startedAt: now, completedAt: now, sectionIds: ['part'],responses:{q:'answer'},questionSnapshot:[{id:'q'}] });
    await fieldbook.persistNow(draft);
  });
  expect(fieldbook.state.plans.find(plan => plan.id === 'reading-plan')).toMatchObject({ status: 'completed', linkedSessionId: 'exam' });
  expect(fieldbook.state.activePlanId).toBeNull();
  mocks.examSectionsRead.mockResolvedValue({sections:[{id:'part',skill:'listening',status:'ready',sentences:[{id:'sentence'}]}],questions:[{id:'q',sectionId:'part'}]});
  await act(async () => { await fieldbook.startPlan('listening-plan'); });
  expect(currentPath).toBe('/listening/intensive/part?sentence=sentence&planId=listening-plan');
  expect(fieldbook.state.settings.activeSkill).toBe('listening');
  await act(async () => {
    const draft = structuredClone(fieldbook.stateRef.current);
    draft.intensiveSessions.push({ id: 'intensive', planId:'listening-plan', sectionId: 'part', sentenceId: 'sentence', completedAt: new Date().toISOString(), stage: 6 });
    await fieldbook.persistNow(draft);
  });
  expect(fieldbook.state.plans.find(plan => plan.id === 'listening-plan')).toMatchObject({ status: 'completed', linkedSessionId: 'intensive' });
});

test('hydration persists proven regional wrong corrections and keeps failed-save recovery', async () => {
  const entry = addVocabularyItem(mocks.initial, { term: 'colour' }).item;
  recordVocabularyReview(mocks.initial, { entryId: entry.id, mode: 'dictation', result: 'failure', response: 'color' });
  const originalReviews = JSON.stringify(mocks.initial.vocabularyReviews);
  mocks.saveState.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await mount();
  await waitFor(() => expect(fieldbook.saveFailed).toBe(true));
  expect(fieldbook.state.vocabularyStates[0].wrong.active).toBe(false);
  expect(JSON.stringify(fieldbook.state.vocabularyReviews)).toBe(originalReviews);
  await act(async () => { expect(await fieldbook.persistNow()).toBe(true); });
  expect(fieldbook.saveFailed).toBe(false);
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
});

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

test('vocabulary browsing commits only after save and preserves assessment updates queued during saving', async () => {
  mocks.initial.wordbookProgress=[{id:'progress',bookId:'book',unitId:'group',completedEntryIds:[],status:'in_progress',updatedAt:'2026-10-12'}];
  await mount();
  const learning={viewedEntryIds:['one'],currentEntryId:'two',updatedAt:'2026-10-12T10:00:00Z'};
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.saveVocabularyLearning('book','group',learning)).toBe(false);});
  expect(fieldbook.state.wordbookProgress[0].learning).toBeUndefined();
  const pending=defer();mocks.saveState.mockImplementationOnce(()=>pending.promise);
  let completion;
  await act(async()=>{completion=fieldbook.saveVocabularyLearning('book','group',learning);await Promise.resolve();});
  expect(fieldbook.state.wordbookProgress[0].learning).toBeUndefined();
  await act(async()=>{fieldbook.persist(draft=>{draft.wordbookProgress[0].completedEntryIds=['assessed'];});await Promise.resolve();});
  await act(async()=>{pending.resolve(true);await completion;});
  await waitFor(()=>expect(mocks.saveState).toHaveBeenCalledTimes(3));
  expect(fieldbook.state.wordbookProgress[0]).toMatchObject({completedEntryIds:['assessed'],learning});
  expect(mocks.saveState.mock.calls.at(-1)[0].wordbookProgress[0]).toMatchObject({completedEntryIds:['assessed'],learning});
});

test('manual mastery changes and dictionary additions stay unchanged on failed durable save', async () => {
  const entry=addVocabularyItem(mocks.initial,{term:'field',meaning:'An open area.'}).item;
  await mount();
  mocks.saveState.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.saveVocabularyStatus(entry.id,entry.senses[0].id,'mastered')).toBe(false);});
  expect(fieldbook.state.vocabularyStates[0].manualStatus).toBe('new');
  await act(async()=>{expect(await fieldbook.saveVocabularyStatus(entry.id,entry.senses[0].id,'mastered')).toBe(true);});
  expect(fieldbook.state.vocabularyStates[0]).toMatchObject({manualStatus:'mastered',statusSource:'manual'});
  await act(async()=>{expect(await fieldbook.saveVocabularyEntry({...entry,senses:[{...entry.senses[0],id:'other',definition:'A subject of study.'}]})).toBe(false);});
  expect(fieldbook.state.vocabulary[0].senses).toHaveLength(1);
});

test('vocabulary learning save completion cannot update a different account', async()=>{
  await mount();const pending=defer();mocks.saveState.mockImplementationOnce(()=>pending.promise);let completion;
  await act(async()=>{completion=fieldbook.saveVocabularyLearning('book','group',{viewedEntryIds:['one'],updatedAt:'2026-10-12'});await Promise.resolve();});
  mocks.owner='account-2';
  await act(async()=>{pending.resolve(true);expect(await completion).toBe(false);});
  expect(fieldbook.state.wordbookProgress).toHaveLength(0);
});

test('first browsing save merges with a concurrently created assessment progress row', async()=>{
  await mount();const pending=defer();mocks.saveState.mockImplementationOnce(()=>pending.promise);let completion;
  const learning={viewedEntryIds:['one'],updatedAt:'2026-10-12'};
  await act(async()=>{completion=fieldbook.saveVocabularyLearning('book','group',learning);await Promise.resolve();});
  await act(async()=>{fieldbook.persist(draft=>draft.wordbookProgress.push({id:'wp-assessment',bookId:'book',unitId:'group',completedEntryIds:['one'],status:'completed',updatedAt:'2026-10-12'}));await Promise.resolve();});
  await act(async()=>{pending.resolve(true);await completion;});
  await waitFor(()=>expect(mocks.saveState).toHaveBeenCalledTimes(2));
  expect(fieldbook.state.wordbookProgress).toHaveLength(1);
  expect(fieldbook.state.wordbookProgress[0]).toMatchObject({id:'wp-assessment',completedEntryIds:['one'],learning});
  expect(mocks.saveState.mock.calls.at(-1)[0].wordbookProgress).toHaveLength(1);
});

test('dictionary sense additions survive a delayed save without overwriting later edits to another sense',async()=>{
  const entry=addVocabularyItem(mocks.initial,{term:'field',meaning:'An open area.'}).item;
  await mount();const pending=defer();mocks.saveState.mockImplementationOnce(()=>pending.promise);let completion;
  await act(async()=>{completion=fieldbook.saveVocabularyEntry({...entry,senses:[{id:'study',definition:'A subject of study.',example:'',pos:'noun'}],sources:[{type:'personal',id:'dictionary:study',senseId:'study'}]});await Promise.resolve();});
  await act(async()=>{fieldbook.persist(draft=>{draft.vocabulary[0].senses[0].definition='My updated note.';});await Promise.resolve();});
  await act(async()=>{pending.resolve(true);await completion;});
  await waitFor(()=>expect(mocks.saveState).toHaveBeenCalledTimes(2));
  expect(fieldbook.state.vocabulary[0].senses.map(s=>s.definition)).toEqual(['My updated note.','A subject of study.']);
  expect(mocks.saveState.mock.calls.at(-1)[0].vocabulary[0].senses).toHaveLength(2);
});

test('manual status resolves canonical legacy entry and sense when a catalog source uses different ids',async()=>{
  const legacy=addVocabularyItem(mocks.initial,{id:'legacy-field',term:'field',senses:[{id:'legacy-sense',definition:'An open area.',example:'',pos:'noun'}]}).item;
  await mount();
  const source={...legacy,id:'catalog-field',senses:[{...legacy.senses[0],id:'catalog-sense'}]};
  await act(async()=>{expect(await fieldbook.saveVocabularyStatus(source.id,'catalog-sense','familiar',source)).toBe(true);});
  expect(fieldbook.state.vocabulary).toHaveLength(1);
  expect(fieldbook.state.vocabularyStates.find(row=>row.entryId===legacy.id && row.senseId===legacy.senses[0].id)).toMatchObject({manualStatus:'familiar',statusSource:'manual'});
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

test('metadata catalog loads complete group identities without entries or database traversal',async()=>{
const snapshot=structuredClone(VOCABULARY_CATALOG);
mocks.releasedRead.mockResolvedValue({books:[{id:'metadata-book',title:'Book',contentStatus:'complete'}],units:[{id:'group',bookId:'metadata-book',title:'Group',kind:'group',entryIds:['metadata-one','metadata-two'],entryCount:2}],memberships:[],entries:[]});
try{await mount();await act(async()=>{await fieldbook.loadVocabularyCatalog();});expect(VOCABULARY_CATALOG.units.find(row=>row.bookId==='metadata-book').entryIds).toHaveLength(2);expect(VOCABULARY_CATALOG.entries.find(row=>row.id==='metadata-one')).toBeUndefined();expect(mocks.catalogRead).not.toHaveBeenCalled();}finally{Object.assign(VOCABULARY_CATALOG,snapshot);}
});

test('legacy released metadata merges into neutral books and removes obsolete starter memberships',async()=>{
  const snapshot=structuredClone(VOCABULARY_CATALOG);
  const neutral='ielts-vocabulary';
  mocks.releasedRead.mockResolvedValue({books:[{id:'guixue:10174',title:'Legacy book',contentStatus:'complete'}],units:[{id:'21795',bookId:'guixue:10174',kind:'group',parentId:'21810',entryIds:[],entryCount:0}],memberships:[],entries:[]});
  try {
    expect(VOCABULARY_CATALOG.memberships.some(row=>row.bookId===neutral&&row.unitId.endsWith('-editorial-starter'))).toBe(true);
    await mount();await act(async()=>{await fieldbook.loadVocabularyCatalog();});
    expect(VOCABULARY_CATALOG.books.filter(row=>row.id===neutral)).toHaveLength(1);
    expect(VOCABULARY_CATALOG.books.some(row=>row.id==='guixue:10174')).toBe(false);
    expect(VOCABULARY_CATALOG.units.some(row=>row.id==='ielts-vocabulary-chapter-01-group-01')).toBe(true);
    expect(VOCABULARY_CATALOG.memberships.some(row=>row.bookId===neutral&&row.unitId.endsWith('-editorial-starter'))).toBe(false);
  } finally {Object.assign(VOCABULARY_CATALOG,snapshot);}
});

test('queued automatic drafts collapse to the latest version behind a manual save', async () => {
  await mount(); vi.useFakeTimers();
  const blocked = defer(); mocks.saveState.mockImplementationOnce(()=>blocked.promise);
  let manual;
  await act(async()=>{manual=fieldbook.persistNow();});
  await act(async()=>{fieldbook.setWritingDraft('q1','Earlier');fieldbook.scheduleDraftPersist();await vi.advanceTimersByTimeAsync(801);});
  await act(async()=>{fieldbook.setWritingDraft('q1','Latest');fieldbook.scheduleDraftPersist();await vi.advanceTimersByTimeAsync(801);});
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  await act(async()=>{blocked.resolve(true);await manual;await Promise.resolve();});
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
  expect(mocks.saveState.mock.calls[1][0].drafts.q1.text).toBe('Latest');
});

test('automatic draft coalescing cannot cross an explicit save', async () => {
  await mount(); vi.useFakeTimers();
  const blocked = defer(); mocks.saveState.mockImplementationOnce(() => blocked.promise);
  let first;
  await act(async () => { first = fieldbook.persistNow(); });
  await act(async () => { fieldbook.setWritingDraft('q1','Auto A'); fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(801); });
  await act(async () => { fieldbook.setWritingDraft('q1','Manual B'); void fieldbook.persistNow(); });
  await act(async () => { fieldbook.setWritingDraft('q1','Auto C'); fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(801); });
  await act(async () => { blocked.resolve(true); await first; await Promise.resolve(); });
  expect(mocks.saveState.mock.calls.slice(1).map(call => call[0].drafts.q1.text)).toEqual(['Auto A','Manual B','Auto C']);
});

test('catalog timeout clears shared read for retry and ignores the expired response', async () => {
  const snapshot = structuredClone(VOCABULARY_CATALOG);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false });
  try {
    await mount();
    vi.useFakeTimers();
    const pending = defer();
    const fresh = {entries: [], books: [], units: [], memberships: [], nextOffset: null};
    mocks.catalogRead.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(fresh);
    let failed;
    await act(async () => {
      failed = fieldbook.loadVocabularyCatalog('timeout-book').catch(error => error);
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect((await failed).message).toMatch(/too long/);
    await act(async () => { expect(await fieldbook.loadVocabularyCatalog('timeout-book')).toBe(true); });
    expect(mocks.catalogRead).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.resolve({...fresh, entries: [{id: 'expired-catalog-entry'}]});
      await Promise.resolve();
    });
    expect(VOCABULARY_CATALOG.entries.some(row => row.id === 'expired-catalog-entry')).toBe(false);
  } finally {
    Object.assign(VOCABULARY_CATALOG, snapshot);
    fetchMock.mockRestore();
  }
});

test('hydrated receptive baselines survive a scoped base save and complete the first review edit', async () => {
  mocks.statuses = { profile: 'ready', plans: 'ready', drafts: 'ready', examAttempts: 'unloaded', intensiveSessions: 'unloaded' };
  mocks.initial.activePlanId = 'review-plan';
  mocks.initial.plans = [{id:'review-plan', kind:'reading-review', status:'in_progress', startedAt:'2026-10-01T00:00:00Z', attemptId:'exam'}];
  const attempt = {id:'exam', skill:'reading', status:'completed', results:{q:false}, errorReasons:{}, evidence:{}, keywords:{}, completedAt:'2026-10-01T01:00:00Z'};
  mocks.moduleRead.mockImplementation(async () => {
    mocks.statuses.examAttempts = mocks.statuses.intensiveSessions = 'ready';
    return {data:{examAttempts:[attempt], intensiveSessions:[]}, statuses:mocks.statuses};
  });
  await mount();
  const blocked = defer(); mocks.saveState.mockImplementationOnce(() => blocked.promise);
  let baseSave;
  await act(async () => { baseSave = fieldbook.persist(draft => { draft.drafts.q1.text = 'Before module hydration'; }); await Promise.resolve(); });
  await act(async () => { await fieldbook.ensureAccountModule('receptive'); });
  await act(async () => { blocked.resolve(true); await baseSave; });
  await act(async () => {
    await fieldbook.persist(draft => {
      draft.examAttempts[0].errorReasons.q = 'Missed the paraphrase';
      draft.examAttempts[0].evidence.q = 'The corresponding passage sentence';
    });
  });
  expect(fieldbook.state.plans[0].status).toBe('completed');
  expect(mocks.saveState.mock.calls[0][2].collections).not.toContain('examAttempts');
});

test('same-owner reload rejects both an old in-flight acknowledgement and an old queued save', async () => {
  await mount();
  const blocked = defer(); mocks.saveState.mockImplementationOnce(() => blocked.promise);
  let first, queued;
  await act(async () => { first = fieldbook.persistNow(); await Promise.resolve(); });
  await act(async () => { queued = fieldbook.persist(draft => { draft.drafts.q1.text = 'Stale queued edit'; }); });
  mocks.initial.drafts.q1.text = 'Fresh account load';
  await act(async () => { fieldbook.retryLoad(); });
  await waitFor(() => expect(fieldbook.state.drafts.q1.text).toBe('Fresh account load'));
  await act(async () => { blocked.resolve(true); expect(await first).toBe(false); expect(await queued).toBe(false); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  expect(fieldbook.state.drafts.q1.text).toBe('Fresh account load');
});

test('preferences and drafts exclude fetched vocabulary until its teaching metadata and state merge finish', async () => {
  mocks.statuses = {profile:'ready', drafts:'ready', plans:'ready', vocabulary:'unloaded'};
  mocks.moduleRead.mockImplementation(async () => {
    mocks.statuses.vocabulary = 'ready';
    return {data:{vocabulary:[{id:'remote-word', term:'adapt'}]}, statuses:mocks.statuses};
  });
  const teaching = defer(); mocks.teachingRead.mockImplementationOnce(() => teaching.promise);
  await mount();
  let loading;
  await act(async () => { loading = fieldbook.ensureAccountModule('vocabulary'); await Promise.resolve(); });
  expect(fieldbook.state.vocabulary).toHaveLength(0);
  await act(async () => { await fieldbook.saveVocabularyPreferences({accent:'us'}); });
  await act(async () => { await fieldbook.persist(draft => { draft.drafts.q1.text = 'While metadata loads'; }); });
  expect(mocks.saveState.mock.calls.every(call => !call[2].collections.includes('vocabulary'))).toBe(true);
  await act(async () => { teaching.resolve({books:[], units:[], entries:[], memberships:[]}); await loading; });
  await act(async () => { await fieldbook.persistNow(); });
  expect(mocks.saveState.mock.calls.at(-1)[2].collections).toContain('vocabulary');
  expect(mocks.saveState.mock.calls.at(-1)[0].vocabulary[0].id).toBe('remote-word');
});

test('plan edits commit after durable save and exclude unloaded collections',async()=>{
  mocks.initial.plans=[{id:'manual',kind:'1',skill:'writing',status:'pending',dateKey:'2026-10-13',estimatedMinutes:20}];
  mocks.statuses={profile:'ready',plans:'ready',drafts:'ready',sessions:'unloaded',vocabulary:'unloaded',examAttempts:'unloaded'};
  await mount();const before=structuredClone(fieldbook.state.plans);
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.changePlan('manual',{type:'skip'})).toBe(false);});
  expect(fieldbook.state.plans).toEqual(before);
  expect(mocks.saveState.mock.calls.at(-1)[2].collections.sort()).toEqual(['plans','profile']);
  await act(async()=>{expect(await fieldbook.changePlan('manual',{type:'skip'})).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({status:'skipped',origin:'manual'});
});

test('committed plan edits survive an older queued draft and do not restore a completed active pointer',async()=>{
  mocks.initial.plans=[{id:'plan',kind:'1',skill:'writing',status:'pending',dateKey:'2026-10-13',estimatedMinutes:20}];
  await mount();const delayed=defer();mocks.saveState.mockImplementationOnce(()=>delayed.promise);
  let edit,autosave;
  await act(async()=>{edit=fieldbook.changePlan('plan',{type:'skip'});await Promise.resolve();});
  await act(async()=>{autosave=fieldbook.persist(draft=>{draft.drafts.q1.text='Written during edit';});});
  await act(async()=>{delayed.resolve(true);await edit;await autosave;});
  expect(mocks.saveState.mock.calls.at(-1)[0].plans[0].status).toBe('skipped');
  expect(fieldbook.state.drafts.q1.text).toBe('Written during edit');
  await act(async()=>{await fieldbook.changePlan('plan',{type:'restore'});await fieldbook.startPlan('plan');});
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans[0].status='completed';draft.activePlanId=null;});});
  expect(mocks.saveState.mock.calls.at(-1)[0].activePlanId).toBeNull();
});

test('unavailable content and failed start save leave the task pending',async()=>{
  mocks.initial.plans=[{id:'reading',kind:'reading-practice',status:'pending',dateKey:'2026-10-13'}];
  await mount();mocks.examSectionsRead.mockRejectedValueOnce(new Error('Unavailable section'));
  await act(async()=>{await expect(fieldbook.startPlan('reading')).rejects.toThrow('Unavailable section');});
  expect(fieldbook.state.plans[0].status).toBe('pending');expect(fieldbook.state.activePlanId).toBeNull();
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.startPlan('reading')).toBe(false);});
  expect(fieldbook.state.plans[0].status).toBe('pending');expect(fieldbook.state.activePlanId).toBeNull();
});

test('unrelated profile changes keep manual pending and running tasks',async()=>{
  mocks.initial.plans=[{id:'manual',kind:'1',status:'pending',origin:'manual',dateKey:'2026-10-13'},{id:'run',kind:'2',status:'in_progress',startedAt:'2026-10-12T12:00:00Z',dateKey:'2026-10-12'}];
  await mount();const before=structuredClone(fieldbook.state.plans);
  await act(async()=>{await fieldbook.saveStudySettings({examDate:'2026-12-01',targetBand:'8'});});
  expect(fieldbook.state.plans).toEqual(before);
  await act(async()=>{await fieldbook.saveStudySettings({dailyMinutes:60});});
  expect(fieldbook.state.plans.filter(row=>['manual','run'].includes(row.id))).toEqual(before.filter(row=>['manual','run'].includes(row.id)));
});

test('an account switch during asynchronous plan binding prevents saving the old account snapshot',async()=>{
  await mount();const pending=defer();let operation;
  await act(async()=>{operation=fieldbook.mutatePlans(async draft=>{await pending.promise;draft.plans.push({id:'account-a-only'});});await Promise.resolve();});
  mocks.owner='account-2';
  await act(async()=>{pending.resolve();expect(await operation).toBe(false);});
  expect(mocks.saveState).not.toHaveBeenCalled();
});

test('an account switch while settings targets load prevents saving profile changes',async()=>{
  await mount();const pending=defer();mocks.examSectionsRead.mockImplementationOnce(()=>pending.promise);let operation;
  await act(async()=>{operation=fieldbook.saveStudySettings({dailyMinutes:45});await Promise.resolve();});
  await waitFor(()=>expect(mocks.examSectionsRead).toHaveBeenCalled());
  mocks.owner='account-2';
  await act(async()=>{pending.resolve({questions:[{id:'q',sectionId:'part'}]});expect(await operation).toBe(false);});
  expect(mocks.saveState).not.toHaveBeenCalled();
});
