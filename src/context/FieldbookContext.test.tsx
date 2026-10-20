// @ts-nocheck
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyState, normalizeDraft } from '../domain';
import { addVocabularyItem, getVocabularyReviewQueue, recordVocabularyReview } from '../domain/vocabulary';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { readDraftRecovery, writeDraftRecovery } from '../storage/recovery';
import { ensureUnifiedPlans, previewBacklogChange, studyBudget } from '../lib/planTemplates';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
import { TodayPage } from '../features/today/TodayPage';
import { PlanningPage } from '../features/planning/PlanningPage';
import { VocabularyPracticePage } from '../features/vocabulary/VocabularyPracticePage';
import '@testing-library/jest-dom/vitest';
import { FieldbookProvider, useFieldbook } from './FieldbookContext';
import { speakingPrompts } from '../domain/speaking';
import { ACCOUNT_MODULES, emptyCollectionStatuses } from '../storage/accountModules';

const mocks = vi.hoisted(() => ({ initial: null, statuses: null, planningRead:vi.fn(), historyRead:vi.fn(), planRowsRead:vi.fn(), moduleRead: vi.fn(), completeRead: vi.fn(), releasedRead: vi.fn(), teachingRead: vi.fn(), saveState: vi.fn(), saveVocabularyImport: vi.fn(), saveVocabularySession:vi.fn(), catalogRead: vi.fn(), examCatalogRead:vi.fn(), examSectionsRead:vi.fn(), downloadFile: vi.fn(), owner: 'account-1' }));
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
  ensureCompleteAccount: (...args) => mocks.completeRead(...args),
  ensureQuestionBank: async skill => structuredClone(skill === 'writing' ? mocks.initial.questions : mocks.initial.speakingTopics),
  ensureSpeakingSample: async () => null,
  subscribeQuestionBank: () => () => {},
}));
vi.mock('../storage/vocabularyCatalog', () => ({
  loadReleasedVocabulary: (...args) => mocks.releasedRead(...args),
  loadReleasedVocabularyTeaching: (...args) => mocks.teachingRead(...args),
  VocabularyScopeUnavailableError: class extends Error {},
}));
vi.mock('../storage/remote', () => ({ accountId: () => mocks.owner, refreshPlanningState:(...args)=>mocks.planningRead(...args),loadVocabularySession:async()=>null,loadVocabularyHistoryPage:async()=>({rows:[],total:0}),rememberPlanningRows:()=>{},loadPlanningRows:(...args)=>mocks.planRowsRead(...args),loadPlanningHistoryPage:(...args)=>mocks.historyRead(...args) }));

let fieldbook;
test('an acknowledged draft save cannot discard recovery for text edited during the request', async () => {
  await mount('/write');
  const pending = defer(); mocks.saveState.mockReturnValueOnce(pending.promise);
  let saving;
  await act(async () => { fieldbook.setWritingDraft('q1', 'First version'); saving = fieldbook.persistNow(undefined, { collections: ['drafts'] }); });
  await act(async () => { fieldbook.setWritingDraft('q1', 'Newer unsaved version'); });
  await act(async () => { pending.resolve(true); await saving; });
  expect(readDraftRecovery(mocks.owner)?.drafts.q1.text).toBe('Newer unsaved version');
  expect(fieldbook.draftSaveStatus('q1')).toBe('unsaved');
});

test('global save failures keep server feedback in one banner without a duplicate toast', async () => {
  await mount('/write');
  mocks.saveState.mockImplementation(async (_next, onError) => { onError?.('The account server took too long to save. Retry saving.'); return false; });
  await act(async () => { await fieldbook.persistNow(); });
  expect(fieldbook.saveFailed).toBe(true);
  expect(fieldbook.saveFailureMessage).toContain('server took too long');
  expect(fieldbook.toastVisible).toBe(false);
});

test('targeted vocabulary saves exclude unrelated unsaved drafts and have one error owner', async () => {
  await mount('/vocabulary');
  const onError = vi.fn();
  await act(async () => { fieldbook.setWritingDraft('q1', 'Unsaved writing'); });
  mocks.saveState.mockClear();
  mocks.saveState.mockImplementationOnce(async (_next, feedback) => { feedback?.('Server timeout'); return false; });
  await act(async () => { expect(await fieldbook.saveVocabularyEntry({ term: 'harbor', meaning: 'A sheltered port.' }, { onError })).toBe(false); });
  expect(mocks.saveState.mock.calls.at(-1)[2].collections).toEqual(['vocabulary', 'vocabularyStates']);
  expect(onError).toHaveBeenCalledWith('Server timeout');
  expect(fieldbook.saveFailed).toBe(false);
  expect(fieldbook.draftSaveStatus('q1')).toBe('unsaved');
});

test('plan edit failures use their local handler without a global error or toast', async () => {
  await mount('/planning');
  await act(async () => { await fieldbook.ensureUnifiedPlans(); });
  const plan = fieldbook.state.plans.find(row => row.status === 'pending');
  expect(plan).toBeTruthy();
  const onError = vi.fn();
  mocks.saveState.mockImplementationOnce(async (_next, feedback) => { feedback?.('Server timeout'); return false; });
  await act(async () => { expect(await fieldbook.changePlan(plan.id, { type: 'skip' }, { onError })).toBe(false); });
  expect(onError).toHaveBeenCalledWith('Server timeout');
  expect(fieldbook.saveFailed).toBe(false);
  expect(fieldbook.state.plans.find(row => row.id === plan.id).status).toBe('pending');
});

test('a locally handled exam save excludes vocabulary migrations and has one error owner', async () => {
  await mount('/reading');
  mocks.saveState.mockClear();
  mocks.saveState.mockImplementation(async (_next, onError) => { onError?.('The account server took too long to save. Retry.'); return false; });
  const onError = vi.fn();
  await act(async () => {
    const draft = structuredClone(fieldbook.stateRef.current);
    draft.examAttempts = [{ id: 'attempt', status: 'paused' }];
    expect(await fieldbook.persistNow(draft, { collections: ['examAttempts', 'plans'], onError })).toBe(false);
  });
  expect(mocks.saveState.mock.calls.at(-1)[2].collections).toEqual(['examAttempts', 'plans']);
  expect(onError).toHaveBeenCalledWith('The account server took too long to save. Retry.');
  expect(fieldbook.saveFailed).toBe(false);
});
let currentPath;
test('a successful scoped exam save keeps recovery for unrelated unsaved writing', async () => {
  await mount('/reading');
  await act(async () => {
    const draft = structuredClone(fieldbook.stateRef.current);
    draft.drafts.q1.text = 'New unsaved writing';
    draft.examAttempts = [{ id: 'attempt', status: 'paused' }];
    expect(await fieldbook.persistNow(draft, { collections: ['examAttempts', 'plans'] })).toBe(true);
  });
  expect(readDraftRecovery(mocks.owner)?.drafts.q1.text).toBe('New unsaved writing');
});
function Probe() { fieldbook = useFieldbook(); currentPath = useLocation().pathname + useLocation().search; return null; }
async function mount(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><FieldbookProvider><Probe /></FieldbookProvider></MemoryRouter>);
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
  vi.stubGlobal('indexedDB',new IDBFactory());
  localStorage.clear();
  mocks.owner = 'account-1';
  mocks.statuses = null;
  mocks.moduleRead.mockReset().mockImplementation(async () => ({data: {}, statuses: {}}));
  mocks.completeRead.mockReset().mockImplementation(async () => structuredClone(mocks.initial));
  mocks.releasedRead.mockReset().mockRejectedValue(new Error('Static resource unavailable'));
  mocks.teachingRead.mockReset().mockResolvedValue({books:[], units:[], entries:[], memberships:[]});
  mocks.saveState.mockReset().mockResolvedValue(true);
  mocks.planningRead.mockReset();
  mocks.planRowsRead.mockReset().mockImplementation(async ids=>({rows:[],plans:(fieldbook?.state||mocks.initial).plans.filter(plan=>ids.includes(plan.id))}));
  mocks.historyRead.mockReset().mockImplementation(async options=>{const all=(fieldbook?.state||mocks.initial).plans.filter(plan=>['completed','skipped'].includes(plan.status));return {rows:[],plans:options.allIds?[]:all.slice(options.offset||0,(options.offset||0)+20),total:all.length,offset:options.offset||0,ids:all.map(plan=>plan.id)};});
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

test.each(['history page','selected rows','full backup'])('%s hydration serializes saves and preserves newly loaded plans in older queued snapshots',async method=>{
  await mount();
  const pending=defer(),writes=[];
  const historical={id:'late-history',dateKey:'2000-01-01',status:'skipped',skill:'vocabulary',title:'Preserved historical task'};
  const read=method==='history page'?mocks.historyRead:method==='selected rows'?mocks.planRowsRead:mocks.completeRead;
  read.mockReturnValueOnce(pending.promise);
  mocks.saveState.mockImplementation(async snapshot=>{writes.push(structuredClone(snapshot));return true;});
  let loading,first,second;
  await act(async()=>{loading=method==='history page'?fieldbook.loadPlanningHistoryPage({}):method==='selected rows'?fieldbook.ensurePlanningRows(['late-history']):fieldbook.ensureCompleteAccount();});
  await waitFor(()=>expect(read).toHaveBeenCalled());
  await act(async()=>{first=fieldbook.persist(draft=>{draft.settings.dailyMinutes=41;});second=fieldbook.persist(draft=>{draft.settings.dailyMinutes=42;});});
  const writesBeforeHydration=writes.length;
  await act(async()=>{pending.resolve(method==='full backup'?{...mocks.initial,plans:[historical],planningRows:[]}:{rows:[],plans:[historical],total:1,offset:0});await loading;await first;await second;});
  expect(writesBeforeHydration).toBe(0);
  expect(writes).toHaveLength(2);
  expect(writes.every(snapshot=>snapshot.plans.some(plan=>plan.id===historical.id))).toBe(true);
  expect(fieldbook.state.plans.some(plan=>plan.id===historical.id)).toBe(true);
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=draft.plans.filter(plan=>plan.id!==historical.id);});});
  expect(writes.at(-1).plans.some(plan=>plan.id===historical.id)).toBe(false);
});

test('reloading historical rows after a scoped refresh still rebases older queued snapshots',async()=>{
  await mount();
  const historical={id:'returned-history',dateKey:'2000-01-01',status:'skipped',skill:'vocabulary',title:'Returned history'};
  mocks.historyRead.mockResolvedValueOnce({rows:[],plans:[historical],total:1,offset:0});
  await act(async()=>{await fieldbook.loadPlanningHistoryPage({});});
  mocks.planningRead.mockResolvedValueOnce({settings:fieldbook.state.settings,plans:[],activePlanId:null});
  await act(async()=>{await fieldbook.refreshPlanningState();});
  expect(fieldbook.state.plans).toEqual([]);
  const pending=defer();mocks.historyRead.mockReturnValueOnce(pending.promise);
  let loading,saving;
  await act(async()=>{loading=fieldbook.loadPlanningHistoryPage({});});
  await waitFor(()=>expect(mocks.historyRead).toHaveBeenCalledTimes(2));
  await act(async()=>{saving=fieldbook.persist(draft=>{draft.settings.dailyMinutes=45;});});
  await act(async()=>{pending.resolve({rows:[],plans:[historical],total:1,offset:0});await loading;await saving;});
  expect(mocks.saveState.mock.calls.at(-1)[0].plans.map(plan=>plan.id)).toContain(historical.id);
});

test('a snapshot frozen during refresh cannot overwrite the freshly loaded planning baseline',async()=>{
  await mount();const pending=defer();mocks.planningRead.mockReturnValueOnce(pending.promise);
  const error=vi.fn();let refreshing,saving;
  await act(async()=>{refreshing=fieldbook.refreshPlanningState();});
  await waitFor(()=>expect(mocks.planningRead).toHaveBeenCalled());
  await act(async()=>{const draft=structuredClone(fieldbook.state);draft.settings.dailyMinutes=45;saving=fieldbook.persistNow(draft,{onError:error});});
  const latest={settings:{...fieldbook.state.settings,dailyMinutes:85},plans:[],activePlanId:null};
  await act(async()=>{pending.resolve(latest);await refreshing;expect(await saving).toBe(false);});
  expect(mocks.saveState).not.toHaveBeenCalled();expect(fieldbook.state.settings.dailyMinutes).toBe(85);
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/schedule was refreshed/));
});

test('speaking draft status distinguishes unsaved, debounce and queue waiting, transport, failure and retry', async () => {
  await mount(); vi.useFakeTimers();
  const [prompt] = speakingPrompts(mocks.initial.speakingTopics[0], '2');
  const blocker = defer(); const transport = defer();
  mocks.saveState.mockReturnValueOnce(blocker.promise).mockReturnValueOnce(transport.promise);
  let unrelated;
  await act(async () => { unrelated = fieldbook.persist(draft => { draft.settings.dailyMinutes = 75; }); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Current answer' }); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('unsaved');
  await act(async () => { fieldbook.scheduleDraftPersist(); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('pending');
  await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('pending');
  await act(async () => { blocker.resolve(true); await unrelated; await Promise.resolve(); });
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saving');
  await act(async () => { transport.resolve(false); await Promise.resolve(); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('failed');
  await act(async () => { expect(await fieldbook.persistNow()).toBe(true); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  const count = mocks.saveState.mock.calls.length;
  await act(async () => {
    expect(fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Current answer' })).toBe(false);
    fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(1500);
  });
  expect(mocks.saveState).toHaveBeenCalledTimes(count);
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
});

test('an old speaking acknowledgement cannot report a newer edit saved or change another prompt status', async () => {
  const topic = { id: 'sp1', part: '1', title: 'Home', questions: ['Where?', 'Why?'] };
  mocks.initial.speakingTopics[0] = topic;
  await mount(); vi.useFakeTimers();
  const [first, second] = speakingPrompts(topic, '1');
  const old = defer(); const current = defer();
  mocks.saveState.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  let oldSave;
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...first, transcript: 'First version' }); oldSave = fieldbook.persistNow(); });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('saving');
  expect(fieldbook.draftSaveStatus('sp1', second.promptKey)).toBe('saved');
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...first, transcript: 'Latest version' }); });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('unsaved');
  await act(async () => { fieldbook.scheduleDraftPersist(); });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('pending');
  await act(async () => { old.resolve(true); await oldSave; });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('pending');
  expect(fieldbook.draftSaveStatus('sp1', second.promptKey)).toBe('saved');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('saving');
  expect(mocks.saveState.mock.calls[1][0].drafts.sp1.responses[first.promptKey].transcript).toBe('Latest version');
  await act(async () => { current.resolve(true); await Promise.resolve(); });
  expect(fieldbook.draftSaveStatus('sp1', first.promptKey)).toBe('saved');
});

test('speaking debounce waits 1500ms and an unchanged edit neither restarts it nor creates another request', async () => {
  await mount(); vi.useFakeTimers();
  const [prompt] = speakingPrompts(mocks.initial.speakingTopics[0], '2');
  const transport = defer(); mocks.saveState.mockReturnValueOnce(transport.promise);
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Debounced answer' }); fieldbook.scheduleDraftPersist(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('pending');
  await act(async () => {
    expect(fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Debounced answer' })).toBe(false);
    fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(499);
  });
  expect(mocks.saveState).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saving');
  await act(async () => { transport.resolve(true); await Promise.resolve(); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  await act(async () => { fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(1500); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
});

test('a repeated answer still waits for acknowledgement of its latest edit generation', async () => {
  await mount(); vi.useFakeTimers();
  const [prompt] = speakingPrompts(mocks.initial.speakingTopics[0], '2');
  const old = defer(); const latest = defer();
  mocks.saveState.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  let oldSave;
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Repeated answer' }); oldSave = fieldbook.persistNow(); });
  await act(async () => {
    fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Intermediate answer' });
    fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Repeated answer' });
    fieldbook.scheduleDraftPersist();
  });
  await act(async () => { old.resolve(true); await oldSave; });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('pending');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saving');
  await act(async () => { latest.resolve(true); await Promise.resolve(); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
});

test('a manual save consumes the scheduled draft without a second unchanged autosave', async () => {
  await mount(); vi.useFakeTimers();
  const [prompt] = speakingPrompts(mocks.initial.speakingTopics[0], '2');
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Save this now' }); fieldbook.scheduleDraftPersist(); });
  await act(async () => { expect(await fieldbook.persistNow()).toBe(true); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
});

test('a scheduled timer does not duplicate a manual draft already waiting in the save queue', async () => {
  await mount(); vi.useFakeTimers();
  const [prompt] = speakingPrompts(mocks.initial.speakingTopics[0], '2');
  const blocker = defer(); mocks.saveState.mockReturnValueOnce(blocker.promise);
  let first; let manual;
  await act(async () => { first = fieldbook.persistNow(); });
  await act(async () => {
    fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'Queued manual answer' });
    fieldbook.scheduleDraftPersist(); manual = fieldbook.persistNow();
  });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('pending');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  await act(async () => { blocker.resolve(true); await first; await manual; await Promise.resolve(); });
  expect(mocks.saveState).toHaveBeenCalledTimes(2);
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
});

test('no-op speaking edits neither dirty their scope nor delay an acknowledged save', async () => {
  await mount();
  const prompt = speakingPrompts(mocks.initial.speakingTopics[0], '2')[0];
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'isolated answer' }); await fieldbook.persistNow(); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  const before = fieldbook.state.drafts.sp1;
  await act(async () => { expect(fieldbook.setSpeakingDraft('sp1', { ...prompt, transcript: 'isolated answer' })).toBe(false); });
  expect(fieldbook.state.drafts.sp1).toBe(before);
  const pending = defer(); mocks.saveState.mockReturnValueOnce(pending.promise);
  let saving; await act(async () => { saving = fieldbook.persist(draft => { draft.settings.dailyMinutes = 75; }); });
  expect(fieldbook.draftSaveStatus('sp1', prompt.promptKey)).toBe('saved');
  await act(async () => { pending.resolve(true); await saving; });
});

test('saving one speaking prompt keeps legacy and sibling drafts and advances to the unsaved prompt', async () => {
  const topic = { id: 'sp2', part: '1', title: 'Home', questions: ['Where do you live?', 'What do you like?'] };
  mocks.initial.speakingTopics[1] = topic;
  const prompts = speakingPrompts(topic, '1');
  mocks.initial.drafts.sp2 = normalizeDraft({ transcript: 'legacy retained', responses: { [prompts[0].promptKey]: { ...prompts[0], transcript: 'first' }, [prompts[1].promptKey]: { ...prompts[1], transcript: 'second' } } });
  await mount();
  await act(async () => { fieldbook.startSpeakingPractice('sp2', '1'); fieldbook.setPendingAttempt({ id: 'prompt-attempt', question: topic, essay: 'first', skill: 'speaking', ...prompts[0] }); });
  await act(async () => { await fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); });
  expect(fieldbook.state.drafts.sp2.transcript).toBe('legacy retained');
  expect(fieldbook.speakingDraft('sp2', prompts[1].promptKey).transcript).toBe('second');
  expect(fieldbook.speakingDraft('sp2', prompts[0].promptKey).transcript).toBe('');
  expect(fieldbook.state.sessions[0]).toMatchObject({ ...prompts[0], questionId: 'sp2' });
  expect(currentPath).toBe('/speak'); expect(fieldbook.questionIndex).toBe(1);
});

test('keyed targeted speaking practice narrows completion to its saved prompt snapshot', async () => {
  const topic = { id: 'sp2', part: '1', title: 'Home', questions: ['Where?', 'Why?'] };
  mocks.initial.speakingTopics[1] = topic;
  const prompt = speakingPrompts(topic, '1')[1];
  await mount();
  await act(async () => { expect(await fieldbook.startTargetedPractice({ id: 'earlier', questionId: 'sp2', skill: 'speaking', essay: 'Focused response', ...prompt })).toBe(true); });
  expect(fieldbook.state.drafts.sp2.targetPrompt).toEqual(prompt);
  expect(fieldbook.speakingDraft('sp2', prompt.promptKey)).toMatchObject({ transcript: 'Focused response', parentSessionId: 'earlier', ...prompt });
  await act(async () => { fieldbook.setPendingAttempt({ id: 'targeted', question: topic, essay: 'Focused response', skill: 'speaking', ...prompt }); });
  await act(async () => { await fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); });
  expect(currentPath).toBe('/review');
  await act(async () => { fieldbook.startSpeakingPractice('sp2', '1'); });
  expect(fieldbook.state.drafts.sp2.targetPrompt).toBeUndefined();
});

test('a completed plan for another topic cannot advance the speaking question selector', async () => {
  const topic = { id: 'sp2', part: '1', title: 'Home', questions: ['Where?', 'Why?'] };
  mocks.initial.speakingTopics[1] = topic;
  const prompts = speakingPrompts(topic, '1');
  mocks.initial.plans = [{ id: 'other', kind: 'speaking-p1', status: 'in_progress', startedAt: '2026-10-14T00:00:00Z', target: { type: 'question', skill: 'speaking', questionId: 'missing', mode: 'full', part: '1', prompts } }];
  await mount();
  await act(async () => { fieldbook.startSpeakingPractice('sp2', '1'); fieldbook.setPendingAttempt({ id: 'different-topic', question: topic, essay: 'answer', skill: 'speaking', planId: 'other', practiceMode: 'full', ...prompts[0] }); });
  await act(async () => { await fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); });
  expect(fieldbook.state.plans[0].completedPromptKeys).toBeUndefined();
  expect(fieldbook.selectedTopic.id).toBe('sp2'); expect(fieldbook.questionIndex).toBe(1);
});

test('speaking mock starts with frozen three-stage prompts and progresses only when each group is saved', async () => {
  const short = { id: 'sp2', part: '1', title: 'Home', questions: ['Where?', 'Why?'] };
  const long = { id: 'sp1', part: '2', title: 'Trip', cueCard: 'Describe a trip', part3: ['How?', 'When?'] };
  mocks.initial.speakingTopics = [long, short];
  mocks.initial.plans = [{ id: 'mock', kind: 'speaking-mock', status: 'pending', skill: 'speaking', target: { type: 'question', skill: 'speaking', questionId: 'sp2', mode: 'timed', part: '1' } }];
  await mount(); await act(async () => { await fieldbook.startPlan('mock'); });
  const plan = () => fieldbook.state.plans.find(row => row.id === 'mock');
  expect(plan().speakingGroups.p3.prompts).toHaveLength(2);
  const firstGroup = structuredClone(plan().target.prompts);
  const save = async (question, prompt) => {
    await act(async () => { fieldbook.setPendingAttempt({ id: crypto.randomUUID(), question, ...prompt, essay: 'Answer', skill: 'speaking', planId: 'mock', practiceMode: 'timed' }); });
    await act(async () => { await fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); });
  };
  await save(short, firstGroup[0]); expect(plan().stage || 'p1').toBe('p1'); expect(fieldbook.questionIndex).toBe(1);
  await save(short, firstGroup[1]); expect(plan().stage).toBe('p2'); expect(fieldbook.deskPart).toBe('2');
  await save(long, plan().target.prompts[0]); expect(plan().stage).toBe('p3'); expect(fieldbook.deskPart).toBe('3');
  const thirdGroup = structuredClone(plan().target.prompts);
  await save(long, thirdGroup[0]); expect(plan().status).toBe('in_progress');
  await save(long, thirdGroup[1]); expect(plan().status).toBe('completed'); expect(currentPath).toBe('/review');
});

test('targeted practice protects an existing draft when replacement is declined', async () => {
  await mount();
  const before = structuredClone(fieldbook.state.drafts.q1);
  let operation;
  await act(async () => { operation = fieldbook.startTargetedPractice({ id: 'original', skill: 'writing', questionId: 'q1', essay: 'Original answer', practiceMode: 'timed' }); });
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await act(async () => { expect(await operation).toBe(false); });
  expect(fieldbook.state.drafts.q1).toEqual(before);
  expect(currentPath).toBe('/');
});

test('declining practice departure prevents any targeted draft mutation or save', async () => {
  await mount();
  const before = structuredClone(fieldbook.state.drafts.q1);
  const guard = event => event.preventDefault();
  document.addEventListener('fieldbook:before-navigate', guard);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    await act(async () => {
      expect(await fieldbook.startTargetedPractice({ id: 'original', skill: 'writing', questionId: 'q1', essay: 'Original answer' })).toBe(false);
    });
    expect(fieldbook.state.drafts.q1).toEqual(before);
    expect(mocks.saveState).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  } finally { document.removeEventListener('fieldbook:before-navigate', guard); confirm.mockRestore(); }
});

test('a deferred departure starts targeted practice only after the guard proceeds', async () => {
  mocks.initial.drafts = {};
  await mount();
  let proceed;
  const guard = event => { event.preventDefault(); proceed = event.detail.proceed; };
  document.addEventListener('fieldbook:before-navigate', guard);
  try {
    await act(async () => {
      expect(await fieldbook.startTargetedPractice({ id: 'original', skill: 'writing', questionId: 'q1', essay: 'Original answer' })).toBe(false);
    });
    expect(mocks.saveState).not.toHaveBeenCalled();
    await act(async () => { proceed(); });
    await waitFor(() => expect(currentPath).toBe('/write'));
    expect(fieldbook.state.drafts.q1.parentSessionId).toBe('original');
  } finally { document.removeEventListener('fieldbook:before-navigate', guard); }
});

test('targeted save failure stays recoverable and retry retains timed mode and selected errors', async () => {
  await mount();
  const original = { id: 'original', skill: 'writing', questionId: 'q1', essay: 'Original answer', practiceMode: 'timed' };
  mocks.saveState.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  let operation;
  await act(async () => { operation = fieldbook.startTargetedPractice(original, 'mistake'); });
  fireEvent.click(await screen.findByRole('button', { name: 'Replace draft' }));
  await act(async () => { expect(await operation).toBe(false); });
  expect(currentPath).toBe('/');
  expect(readDraftRecovery(mocks.owner)?.drafts.q1).toMatchObject({ text: 'Original answer', practiceMode: 'timed', parentSessionId: 'original', targetErrorIds: ['mistake'] });
  await act(async () => { expect(await fieldbook.startTargetedPractice(original, 'mistake')).toBe(true); });
  expect(currentPath).toBe('/write');
  expect(fieldbook.currentDeskMode()).toBe('timed');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('historical paragraph practice remains editable in its original mode', async () => {
  mocks.initial.drafts = {};
  await mount();
  await act(async () => { await fieldbook.startTargetedPractice({ id: 'original', skill: 'writing', questionId: 'q1', essay: 'My practice paragraph.', practiceMode: 'body' }); });
  expect(fieldbook.state.drafts.q1.sections.paragraph).toBe('My practice paragraph.');
  expect(fieldbook.currentDeskMode()).toBe('body');
});

test('feedback import cannot mutate a new account after a delayed complete-account read', async () => {
  await mount();
  const pending = defer(); mocks.completeRead.mockImplementationOnce(() => pending.promise);
  let operation;
  await act(async () => { operation = fieldbook.importFeedback('overall: 6.5\n\n## Candidate response\nAn old account response.', 'feedback.md'); });
  await waitFor(() => expect(mocks.completeRead).toHaveBeenCalled());
  mocks.owner = 'account-2';
  await act(async () => { pending.resolve(mocks.initial); expect((await operation).saved).toBe(false); });
  expect(mocks.saveState).not.toHaveBeenCalled();
  expect(fieldbook.state.assessments).toHaveLength(0);
});

test('fresh speaking practice follows the selected topic part and preserves an explicit Part 3', async () => {
  mocks.initial.speakingTopics.reverse();
  await mount();
  expect(fieldbook.selectedTopic.id).toBe('sp2');
  expect(fieldbook.deskPart).toBe('1');
  await act(async () => { fieldbook.setSelectedTopicId('sp1'); fieldbook.setDeskPart('3'); });
  expect(fieldbook.deskPart).toBe('3');
  await act(async () => { fieldbook.setSpeakingDraft('sp1', { transcript: 'New answer.' }); });
  expect(fieldbook.deskPart).toBe('3');
});

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

test('productive draft hydration merges saved drafts without replacing edits made while loading', async () => {
  mocks.initial.drafts = {};
  mocks.statuses = {profile:'ready',plans:'ready',drafts:'unloaded',sessions:'unloaded'};
  const pending = defer();
  mocks.moduleRead.mockImplementationOnce(() => pending.promise);
  await mount();
  let request;
  await act(async () => { request = fieldbook.ensureAccountModule('productive'); });
  await act(async () => { fieldbook.setWritingDraft('q1', 'Live local answer'); });
  await act(async () => {
    pending.resolve({data:{sessions:[],assessments:[],errors:[],stories:[],drafts:{q1:normalizeDraft({text:'Older remote answer'}),q2:normalizeDraft({text:'Saved second answer'})}},statuses:{}});
    await request;
  });
  expect(fieldbook.state.drafts.q1.text).toBe('Live local answer');
  expect(fieldbook.state.drafts.q2.text).toBe('Saved second answer');
  expect(fieldbook.draftSaveStatus('q1')).toBe('unsaved');
  expect(fieldbook.draftSaveStatus('q2')).toBe('saved');
});

test('a settings save before productive hydration preserves local recovery and defers its comparison', async () => {
  mocks.initial.drafts = {};
  mocks.statuses = {profile:'ready',plans:'ready',drafts:'unloaded',sessions:'unloaded'};
  const recovery = {q1:normalizeDraft({text:'Recovered local answer'})};
  writeDraftRecovery(mocks.owner, recovery);
  await mount('/settings/schedule');
  expect(fieldbook.recoveryDrafts).toBeNull();
  await act(async () => { await fieldbook.persist(draft => { draft.settings.dailyMinutes = 45; }); });
  expect(readDraftRecovery(mocks.owner)?.drafts).toEqual(recovery);
  expect(mocks.saveState.mock.calls.at(-1)[2].collections).not.toContain('drafts');
  mocks.moduleRead.mockResolvedValueOnce({data:{sessions:[],assessments:[],errors:[],stories:[],drafts:{q1:normalizeDraft({text:'Older cloud answer'})}},statuses:{}});
  await act(async () => { await fieldbook.ensureAccountModule('productive'); });
  expect(fieldbook.state.drafts.q1.text).toBe('Older cloud answer');
  expect(fieldbook.recoveryDrafts).toEqual(recovery);
});

test('delayed writing hydration keeps untouched saved sections while preserving a local section edit', async () => {
  mocks.initial.drafts = {};
  mocks.statuses = {profile:'ready',plans:'ready',drafts:'unloaded',sessions:'unloaded'};
  const pending = defer(); mocks.moduleRead.mockImplementationOnce(() => pending.promise);
  await mount(); let request;
  await act(async () => { request = fieldbook.ensureAccountModule('productive'); });
  await act(async () => { fieldbook.setWritingDraft('q1', 'New overview', {sections:{overview:'New overview'}}); });
  const cloud = normalizeDraft({text:'Saved introduction',sections:{intro:'Saved introduction',overview:'Old overview'}});
  await act(async () => { pending.resolve({data:{sessions:[],assessments:[],errors:[],stories:[],drafts:{q1:cloud}},statuses:{}}); await request; });
  expect(fieldbook.state.drafts.q1.sections.intro).toBe('Saved introduction');
  expect(fieldbook.state.drafts.q1.sections.overview).toBe('New overview');
  expect(fieldbook.state.drafts.q1.text).toBe('New overview');
});

test('delayed productive drafts preserve a saved speaking sibling while keeping the edited response', async () => {
  mocks.initial.drafts = {};
  mocks.statuses = {profile:'ready',plans:'ready',drafts:'unloaded',sessions:'unloaded'};
  const [first, second] = speakingPrompts({title:'Home',questions:['Where do you live?','What do you like about it?']}, '1');
  const pending = defer();
  mocks.moduleRead.mockImplementationOnce(() => pending.promise);
  await mount(); let request;
  await act(async () => { request = fieldbook.ensureAccountModule('productive'); });
  await act(async () => { fieldbook.setSpeakingDraft('sp1', {...first,transcript:'New first answer'}); });
  const cloud = normalizeDraft({responses:{[first.promptKey]:{...first,transcript:'Old first answer'},[second.promptKey]:{...second,transcript:'Saved second answer'}}});
  await act(async () => { pending.resolve({data:{sessions:[],assessments:[],errors:[],stories:[],drafts:{sp1:cloud}},statuses:{}}); await request; });
  expect(fieldbook.speakingDraft('sp1',first.promptKey).transcript).toBe('New first answer');
  expect(fieldbook.speakingDraft('sp1',second.promptKey).transcript).toBe('Saved second answer');
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

test('an old account read cannot prepare teaching identities for its replacement account', async () => {
  mocks.statuses = emptyCollectionStatuses();
  const saved = structuredClone(VOCABULARY_CATALOG.entries.slice(0, 1));
  const pending = defer(); mocks.moduleRead.mockImplementationOnce(() => pending.promise);
  await mount(); let request;
  await act(async () => { request = fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[0].id]}).catch(() => false); });
  mocks.owner = 'account-2';
  await act(async () => { pending.resolve({data:{vocabulary:saved},statuses:{}}); await request; });
  expect(mocks.teachingRead).not.toHaveBeenCalled();
  mocks.moduleRead.mockResolvedValueOnce({data:{vocabulary:saved},statuses:{}});
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[0].id]}); });
  expect(mocks.teachingRead).toHaveBeenCalledWith({entryIds:[saved[0].id],allowMissingEntryIds:true});
  expect(fieldbook.state.vocabulary).toHaveLength(1);
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

test('edits during every completion merge stay live and recoverable until their own acknowledgement', async () => {
  const topic = { id: 'sp2', part: '1', title: 'Home', questions: ['Where?', 'Why?'] };
  mocks.initial.speakingTopics[1] = topic;
  const prompts = speakingPrompts(topic, '1');
  mocks.initial.drafts.sp2 = normalizeDraft({ responses: { [prompts[0].promptKey]: { ...prompts[0], transcript: 'first answer' }, [prompts[1].promptKey]: { ...prompts[1], transcript: 'sibling answer' } } });
  await mount();
  await act(async () => { fieldbook.setPendingAttempt({ id: 'merged-attempt', question: topic, essay: 'first answer', skill: 'speaking', ...prompts[0] }); });
  const first = defer(); const second = defer(); const third = defer();
  mocks.saveState.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  let completion;
  await act(async () => { completion = fieldbook.saveAttempt(false, { focus: '', next: '', errors: '' }); });
  await act(async () => { fieldbook.closeModal(); fieldbook.setSpeakingDraft(topic.id, { ...prompts[1], transcript: 'edit during first save' }); });
  await act(async () => { first.resolve(true); });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(2));
  await act(async () => { fieldbook.setSpeakingDraft(topic.id, { ...prompts[1], transcript: 'latest edit during merge save' }); });
  await act(async () => { second.resolve(true); });
  expect(fieldbook.speakingDraft(topic.id, prompts[1].promptKey).transcript).toBe('latest edit during merge save');
  expect(readDraftRecovery('account-1')?.drafts.sp2.responses[prompts[1].promptKey].transcript).toBe('latest edit during merge save');
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(3));
  expect(mocks.saveState.mock.calls[2][0].drafts.sp2.responses[prompts[1].promptKey].transcript).toBe('latest edit during merge save');
  await act(async () => { third.resolve(true); await completion; });
  expect(fieldbook.speakingDraft(topic.id, prompts[0].promptKey).transcript).toBe('');
  expect(fieldbook.speakingDraft(topic.id, prompts[1].promptKey).transcript).toBe('latest edit during merge save');
  expect(fieldbook.state.sessions.filter(session => session.id === 'merged-attempt')).toHaveLength(1);
  expect(readDraftRecovery('account-1')).toBeNull();
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

test('a planned review waits for task completion, reports a failed task save and retries without duplicating the session', async () => {
  const refs = Array.from({length:30}, (_, index) => ({entryId:`word-${index}`, senseId:`sense-${index}`}));
  mocks.initial.plans = [{id:'review-plan',kind:'vocabulary',status:'in_progress',startedAt:'2026-10-20T01:00:00Z',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',cards:refs}}];
  mocks.initial.activePlanId = 'review-plan';
  mocks.statuses = {plans:'ready',profile:'ready'};
  await mount('/vocabulary/review');
  const draft = structuredClone(fieldbook.stateRef.current);
  draft.vocabularySessions.push({id:'submitted-30',planId:'review-plan',status:'submitted',mode:'dictation',startedAt:'2026-10-20T01:01:00Z',submittedAt:'2026-10-20T01:10:00Z',results:refs.map((ref,index)=>({...ref,response:`answer-${index}`,result:index<24?'success':'failure'}))});
  const pending = defer();
  mocks.saveState.mockClear();
  mocks.saveState.mockImplementationOnce(() => pending.promise);
  const onError = vi.fn();
  let settled = false, completion;
  await act(async () => { completion = fieldbook.persistVocabularySession(draft,'submitted-30',{onError}).then(result=>{settled=true;return result;}); });
  await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(1));
  expect(settled).toBe(false);
  await act(async () => { pending.resolve(false); expect(await completion).toBe(false); });
  expect(onError).toHaveBeenCalledWith(expect.stringMatching(/review is saved.*task/i));
  expect(fieldbook.state.plans[0].status).toBe('in_progress');
  expect(fieldbook.state.vocabularySessions).toHaveLength(1);
  await act(async () => { expect(await fieldbook.persistVocabularySession(draft,'submitted-30',{onError})).toBe(true); });
  expect(fieldbook.state.plans[0]).toMatchObject({status:'completed',linkedSessionId:'submitted-30'});
  expect(fieldbook.state.vocabularySessions).toHaveLength(1);
  expect(mocks.saveState.mock.calls.at(-1)[2].collections.sort()).toEqual(['plans','profile']);
});

test('a task completed on another device is refreshed after a submission conflict without replacing its completion', async () => {
  const refs = [{entryId:'word',senseId:'sense'}];
  mocks.initial.plans = [{id:'review-plan',kind:'vocabulary',status:'in_progress',startedAt:'2026-10-20T01:00:00Z',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',cards:refs}}];
  mocks.initial.activePlanId='review-plan';
  mocks.statuses={plans:'ready',profile:'ready'};
  await mount('/vocabulary/review');
  const draft=structuredClone(fieldbook.stateRef.current);
  draft.vocabularySessions.push({id:'our-session',planId:'review-plan',status:'submitted',mode:'dictation',startedAt:'2026-10-20T01:01:00Z',submittedAt:'2026-10-20T01:10:00Z',results:refs.map(ref=>({...ref,response:'wrong answer',result:'failure'}))});
  mocks.saveState.mockImplementationOnce(async (_next,onError)=>{onError?.('Your plan changed on another device. Refresh the preview before saving.');return false;});
  mocks.planningRead.mockResolvedValue({settings:fieldbook.state.settings,activePlanId:null,plans:[{...draft.plans[0],status:'completed',linkedSessionId:'other-session'}]});
  const onResult=vi.fn();
  await act(async()=>{expect(await fieldbook.persistVocabularySession(draft,'our-session',{onResult})).toBe(true);});
  expect(mocks.planningRead).toHaveBeenCalledTimes(1);
  expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({learningSaved:true,taskStatus:'already-completed'}));
  expect(fieldbook.state.plans[0].linkedSessionId).toBe('other-session');
  expect(fieldbook.state.vocabularySessions).toHaveLength(1);
  expect(mocks.saveState).toHaveBeenCalledTimes(1);
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

test('provider preserves same-word exam occurrences after sequential collection and a later full persist', async () => {
  await mount();
  const input = paragraphId => ({ term: 'riverbank', senses: [{ id: 'river', definition: 'Land beside a river.', example: '', pos: 'noun' }], sources: [{ type: 'reading', id: 'part', senseId: 'river', exam: { sectionId: 'part', paragraphId, blockId: `passage:p:${paragraphId}`, quote: 'riverbank', start: 2, end: 11 } }] });
  await act(async () => { expect(await fieldbook.saveVocabularyEntry(input('A'))).toBe(true); });
  await act(async () => { expect(await fieldbook.saveVocabularyEntry(input('B'))).toBe(true); });
  expect(fieldbook.state.vocabulary[0].sources.map(source => source.exam.paragraphId)).toEqual(['A', 'B']);
  await act(async () => { expect(await fieldbook.persistNow()).toBe(true); });
  expect(mocks.saveState.mock.calls.at(-1)[0].vocabulary[0].sources.map(source => source.exam.paragraphId)).toEqual(['A', 'B']);
  expect(fieldbook.state.vocabularyStates[0]).toMatchObject({ reviewCount: 0, cards: {} });
  expect(fieldbook.state.vocabularyEvidence).toEqual([]);
});

test('a real dictionary hull sense stays reviewable from its exact Part after provider save and replay', async () => {
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const dictionary = JSON.parse(readFileSync(`public/dictionary/${index.hull}`, 'utf8'));
  await mount();
  const input = { term: 'hull', senses: [dictionary.senses[0]], sources: Array.from({ length: 10 }, (_, position) => ({ type: 'reading', id: 'source:1004', skill: 'reading', senseId: dictionary.senses[0].id, exam: { sectionId: 'source:1004', attemptId: 'attempt', blockId: 'passage:p:A', paragraphId: 'A', quote: 'hull', start: position * 10, end: position * 10 + 4 } })) };
  await act(async () => { expect(await fieldbook.saveVocabularyEntry(input)).toBe(true); });
  const filter = { sourceType: 'reading', sourceId: 'source:1004', mode: 'definition', dueOnly: false };
  const queue = getVocabularyReviewQueue(fieldbook.state, filter);
  expect(queue).toHaveLength(1);
  expect(queue[0].senseId).toBe(dictionary.senses[0].id);
  expect(queue[0].sources).toHaveLength(10);
  expect(queue[0].entry.senses.find(sense => sense.id === queue[0].senseId).definition).toBe('The outer covering of a fruit or seed.');
  await act(async () => { expect(await fieldbook.persistNow()).toBe(true); });
  expect(getVocabularyReviewQueue(mocks.saveState.mock.calls.at(-1)[0], filter)).toHaveLength(1);
});

function receptiveCollectionStatuses() {
  const statuses = emptyCollectionStatuses();
  ['profile', 'plans', 'drafts', ...ACCOUNT_MODULES.receptive].forEach(key => { statuses[key] = 'ready'; });
  return statuses;
}

function vocabularyModuleData(vocabulary = []) {
  return Object.fromEntries(ACCOUNT_MODULES.vocabulary.map(key => [key, key === 'vocabulary' ? vocabulary : []]));
}

test('exam collection waits for unloaded vocabulary and durably preserves the chosen hull sense and remote words', async () => {
  mocks.statuses = receptiveCollectionStatuses();
  const pending = defer();
  mocks.moduleRead.mockImplementationOnce(() => pending.promise.then(result => {
    ACCOUNT_MODULES.vocabulary.forEach(key => { mocks.statuses[key] = 'ready'; });
    return result;
  }));
  const remote = addVocabularyItem(emptyState(), { term: 'remote', meaning: 'Already saved elsewhere.' }).item;
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const dictionary = JSON.parse(readFileSync(`public/dictionary/${index.hull}`, 'utf8'));
  const input = { term: 'hull', senses: [dictionary.senses[0]], sources: [{ type: 'reading', id: 'source:1004', senseId: dictionary.senses[0].id, exam: { sectionId: 'source:1004', blockId: 'passage:p:A', quote: 'hull', start: 0, end: 4 } }] };
  await mount('/reading/review/attempt');
  let saving;
  await act(async () => { saving = fieldbook.saveVocabularyEntry(input); await Promise.resolve(); });
  expect(mocks.moduleRead).toHaveBeenCalledWith('vocabulary');
  expect(mocks.saveState).not.toHaveBeenCalled();
  expect(fieldbook.state.vocabulary).toHaveLength(0);
  await act(async () => { pending.resolve({ data: vocabularyModuleData([remote]), statuses: mocks.statuses }); expect(await saving).toBe(true); });
  const saved = mocks.saveState.mock.calls.at(-1);
  expect(saved[2].collections).toEqual(expect.arrayContaining(['vocabulary', 'vocabularyStates']));
  expect(saved[0].vocabulary.map(entry => entry.term)).toEqual(['remote', 'hull']);
  const filter = { sourceType: 'reading', sourceId: 'source:1004', mode: 'definition', dueOnly: false };
  expect(getVocabularyReviewQueue(saved[0], filter)).toHaveLength(1);
  expect(getVocabularyReviewQueue(saved[0], filter)[0].senseId).toBe(dictionary.senses[0].id);
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary'); await fieldbook.persistNow(); });
  expect(getVocabularyReviewQueue(mocks.saveState.mock.calls.at(-1)[0], filter)).toHaveLength(1);
  expect(fieldbook.state.vocabularyEvidence).toEqual([]);
});

test('exam collection returns failure without mutation when vocabulary hydration fails and can retry', async () => {
  mocks.statuses = receptiveCollectionStatuses();
  mocks.moduleRead.mockRejectedValueOnce(new Error('Offline')).mockImplementationOnce(async () => {
    ACCOUNT_MODULES.vocabulary.forEach(key => { mocks.statuses[key] = 'ready'; });
    return { data: vocabularyModuleData(), statuses: mocks.statuses };
  });
  await mount('/reading/review/attempt');
  const input = { term: 'harbor', meaning: 'A sheltered port.', sources: [{ type: 'reading', id: 'part' }] };
  await act(async () => { expect(await fieldbook.saveVocabularyEntry(input)).toBe(false); });
  expect(mocks.saveState).not.toHaveBeenCalled();
  expect(fieldbook.state.vocabulary).toEqual([]);
  expect(fieldbook.saveStatus).toBe('failed');
  await act(async () => { expect(await fieldbook.saveVocabularyEntry(input)).toBe(true); });
  expect(mocks.moduleRead).toHaveBeenCalledTimes(2);
  expect(fieldbook.state.vocabulary[0].term).toBe('harbor');
});

test('exam collection does not write or merge when the account changes during vocabulary hydration', async () => {
  mocks.statuses = receptiveCollectionStatuses();
  const pending = defer(); mocks.moduleRead.mockImplementationOnce(() => pending.promise);
  await mount('/reading/review/attempt');
  let saving;
  await act(async () => { saving = fieldbook.saveVocabularyEntry({ term: 'old-owner-word', meaning: 'Private to account one.' }); await Promise.resolve(); });
  expect(mocks.moduleRead).toHaveBeenCalledWith('vocabulary');
  mocks.owner = 'account-2';
  await act(async () => { fieldbook.retryLoad(); });
  await waitFor(() => expect(fieldbook.booted).toBe(true));
  await act(async () => { pending.resolve({ data: vocabularyModuleData([{ id: 'private-old-entry', term: 'private' }]), statuses: mocks.statuses }); expect(await saving).toBe(false); });
  expect(mocks.saveState).not.toHaveBeenCalled();
  expect(fieldbook.state.vocabulary).toEqual([]);
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
  expect(mocks.saveState.mock.calls.at(-1)[2].collections).toEqual(['profile']);
  expect(fieldbook.state.settings.vocabulary.layout).toBe('cards');
  expect(fieldbook.state.settings.vocabulary.volume).toBe(0.6);
  expect(fieldbook.state.drafts.q1.text).toBe('A response that must survive.');
  expect(fieldbook.state.plans).toEqual(pending);
});

test('settings save feedback resets between study and vocabulary retries',async()=>{
  await mount();
  mocks.saveState.mockImplementationOnce(async(_state,feedback)=>{feedback('Check your connection and retry.');return false;});
  await act(async()=>{expect(await fieldbook.saveStudySettings({targetBand:7})).toBe(false);});
  expect(fieldbook.getStudySettingsError()).toContain('connection');
  expect(fieldbook.saveFailed).toBe(false);
  expect(fieldbook.toastVisible).toBe(false);
  mocks.saveState.mockImplementationOnce(async(_state,feedback)=>{feedback('Sign in again to save.');return false;});
  await act(async()=>{expect(await fieldbook.saveVocabularyPreferences({accent:'us'})).toBe(false);});
  expect(fieldbook.getStudySettingsError()).toContain('Sign in again');
  expect(fieldbook.saveFailed).toBe(false);
  await act(async()=>{expect(await fieldbook.saveVocabularyPreferences({accent:'us'})).toBe(true);});
  expect(fieldbook.getStudySettingsError()).toBe('');
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
  await act(async()=>{fieldbook.setWritingDraft('q1','Earlier');fieldbook.scheduleDraftPersist();await vi.advanceTimersByTimeAsync(1501);});
  await act(async()=>{fieldbook.setWritingDraft('q1','Latest');fieldbook.scheduleDraftPersist();await vi.advanceTimersByTimeAsync(1501);});
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
  await act(async () => { fieldbook.setWritingDraft('q1','Auto A'); fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(1501); });
  await act(async () => { fieldbook.setWritingDraft('q1','Manual B'); void fieldbook.persistNow(); });
  await act(async () => { fieldbook.setWritingDraft('q1','Auto C'); fieldbook.scheduleDraftPersist(); await vi.advanceTimersByTimeAsync(1501); });
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

test('a cold exact-word route prepares only its teaching while retaining every saved account entry', async () => {
  mocks.statuses = emptyCollectionStatuses();
  const saved = JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8')).entries.slice(0, 200);
  expect(saved).toHaveLength(200);
  mocks.moduleRead.mockImplementation(async () => {
    ACCOUNT_MODULES.vocabulary.forEach(key => { mocks.statuses[key] = 'ready'; });
    return {data:{vocabulary:saved}, statuses:mocks.statuses};
  });
  const teaching = defer(); mocks.teachingRead.mockImplementationOnce(() => teaching.promise);
  await mount('/vocabulary/entry/' + saved[0].id);
  let loading;
  await act(async () => {
    loading = fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[0].id]});
    await Promise.resolve();
  });
  expect(mocks.teachingRead).toHaveBeenCalledWith({entryIds:[saved[0].id], allowMissingEntryIds:true});
  expect(fieldbook.state.vocabulary).toHaveLength(0);
  await act(async () => { teaching.resolve({books:[],units:[],entries:[],memberships:[]}); await loading; });
  expect(fieldbook.state.vocabulary).toHaveLength(200);
  expect(fieldbook.state.vocabulary[199]).toEqual(saved[199]);
});

test('opening all words after a scoped load prepares missing teaching without remerging an old account snapshot over personal edits', async () => {
  mocks.statuses = emptyCollectionStatuses();
  const saved = structuredClone(VOCABULARY_CATALOG.entries.slice(0, 3));
  mocks.moduleRead.mockImplementation(async () => {
    ACCOUNT_MODULES.vocabulary.forEach(key => { mocks.statuses[key] = 'ready'; });
    return {data:{vocabulary:structuredClone(saved)},statuses:mocks.statuses};
  });
  await mount('/vocabulary/entry/' + saved[0].id);
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[0].id]}); });
  mocks.teachingRead.mockClear();
  const teaching = defer(); mocks.teachingRead.mockImplementationOnce(() => teaching.promise);
  let full;
  await act(async () => {
    full = fieldbook.ensureAccountModule('vocabulary');
    await Promise.resolve();
  });
  expect(mocks.teachingRead).toHaveBeenCalledWith({entryIds:saved.slice(1).map(e=>e.id).sort(),allowMissingEntryIds:true});
  await act(async () => { await fieldbook.persist(draft => {
    draft.vocabulary[1].senses[0].definition = 'My own meaning edited while the list prepares.';
  }); });
  await act(async () => { teaching.resolve({books:[],units:[],entries:[],memberships:[]}); await full; });
  expect(mocks.moduleRead).toHaveBeenCalledTimes(1);
  expect(fieldbook.state.vocabulary[1].senses[0].definition).toBe('My own meaning edited while the list prepares.');
  mocks.teachingRead.mockClear();
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[2].id]}); });
  expect(mocks.teachingRead).not.toHaveBeenCalled();
});

test('a failed additional teaching scope retries without discarding already merged vocabulary or loading all words', async () => {
  mocks.statuses = emptyCollectionStatuses();
  const saved = structuredClone(VOCABULARY_CATALOG.entries.slice(0, 2));
  mocks.moduleRead.mockImplementation(async () => {
    ACCOUNT_MODULES.vocabulary.forEach(key => { mocks.statuses[key] = 'ready'; });
    return {data:{vocabulary:saved},statuses:mocks.statuses};
  });
  await mount();
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[0].id]}); });
  const before = structuredClone(fieldbook.state.vocabulary);
  mocks.teachingRead.mockClear().mockRejectedValueOnce(new Error('Second scope unavailable'));
  await act(async () => {
    await expect(fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[1].id]})).rejects.toThrow('Second scope unavailable');
  });
  expect(fieldbook.state.vocabulary).toEqual(before);
  await act(async () => { await fieldbook.ensureAccountModule('vocabulary', {entryIds:[saved[1].id]}); });
  expect(mocks.teachingRead).toHaveBeenCalledTimes(2);
  for(const [options] of mocks.teachingRead.mock.calls) expect(options.entryIds).toEqual([saved[1].id]);
  expect(mocks.moduleRead).toHaveBeenCalledTimes(1);
});

test('forcing a prepared teaching scope refreshes its resources and merges memberships without replaying account rows', async () => {
  mocks.statuses=emptyCollectionStatuses();
  const saved=structuredClone(VOCABULARY_CATALOG.entries.slice(0,2));
  mocks.moduleRead.mockImplementation(async()=>{
    ACCOUNT_MODULES.vocabularyCore.forEach(key=>{mocks.statuses[key]='ready';});
    return {data:{vocabulary:structuredClone(saved)},statuses:mocks.statuses};
  });
  const memberships=VOCABULARY_CATALOG.memberships;
  try {
    await mount();
    await act(async()=>{await fieldbook.ensureAccountModule('vocabularyCore',{entryIds:[]});});
    const member={id:'scoped-teaching-member',entryId:saved[0].id,bookId:'test-book',unitId:'test-unit',order:1};
    mocks.teachingRead.mockResolvedValue({books:[],units:[],entries:[],memberships:[member]});
    await act(async()=>{await fieldbook.ensureAccountModule('vocabularyCore',{entryIds:[saved[0].id]});});
    expect(VOCABULARY_CATALOG.memberships).toContainEqual(member);
    await act(async()=>{await fieldbook.persist(draft=>{draft.vocabulary[0].senses[0].example='My own saved sentence.';});});
    mocks.teachingRead.mockClear();
    await act(async()=>{await fieldbook.ensureAccountModule('vocabularyCore',{entryIds:[saved[0].id],force:true});});
    expect(mocks.teachingRead).toHaveBeenCalledWith({entryIds:[saved[0].id],allowMissingEntryIds:true,force:true});
    expect(mocks.moduleRead).toHaveBeenCalledTimes(1);
    expect(fieldbook.state.vocabulary[0].senses[0].example).toBe('My own saved sentence.');
  } finally {VOCABULARY_CATALOG.memberships=memberships;}
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
  expect(fieldbook.state.plans[0]).toMatchObject({status:'skipped',manuallyEditedAt:expect.any(String)});
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

test('direct settings saves load released vocabulary metadata before generating new batch targets',async()=>{
  const catalog=structuredClone(VOCABULARY_CATALOG);
  const bookId='ielts-vocabulary';
  mocks.initial.wordbookEnrollments=[{id:'enrolled',bookId}];
  mocks.initial.settings.days=[1,2,3,4,5,6,7];
  const released={books:[{id:bookId,contentStatus:'complete'}],units:[],memberships:[],entries:[]};
  mocks.releasedRead.mockResolvedValue(released);
  mocks.catalogRead.mockImplementation(async({unitId})=>{
    if(unitId && !VOCABULARY_CATALOG.units.some(unit=>unit.id===unitId))throw new Error('Removed starter group');
    return {entries:[],books:[],units:[],memberships:[],nextOffset:null};
  });
  try{
    await mount();
    let saved;
    await act(async()=>{saved=await fieldbook.saveStudySettings({dailyMinutes:60});});
    expect(saved,fieldbook.getStudySettingsError()).toBe(true);
    expect(mocks.saveState).toHaveBeenCalled();
    const options=mocks.saveState.mock.calls.at(-1)[2];
    expect(options.collections).toEqual(['profile','plans']);
    expect(fieldbook.state.plans.every(plan=>!plan.target?.unitId?.includes('editorial-starter'))).toBe(true);
  }finally{Object.assign(VOCABULARY_CATALOG,catalog);}
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

test('dynamic vocabulary starts freeze current candidates durably and retain Planning origin',async()=>{
  const entry=addVocabularyItem(mocks.initial,{term:'persistent',meaning:'Continuing over time.'}).item;
  mocks.initial.vocabularyStates.find(row=>row.entryId===entry.id).manualStatus='unfamiliar';
  mocks.initial.plans=[{id:'dynamic-review',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:1,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'dictation',cards:[]}}];
  await mount('/planning?week=next#task-dynamic-review');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=draft.plans.filter(row=>row.id==='dynamic-review');});});
  await act(async()=>{expect(await fieldbook.startPlan('dynamic-review')).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({status:'in_progress',target:{binding:'frozen',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}});
  expect(new URLSearchParams(currentPath.split('?')[1]).get('returnTo')).toBe('/planning?week=next#task-dynamic-review');
  expect(mocks.saveState.mock.calls.at(-1)[0].plans[0].target.binding).toBe('frozen');
});

test('empty dynamic vocabulary skips as no-longer-due without completion or navigation',async()=>{
  mocks.initial.plans=[{id:'empty-review',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:10,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'definition',cards:[]}}];
  await mount('/');
  await act(async()=>{expect(await fieldbook.startPlan('empty-review')).toBe(true);});
  const plan=fieldbook.state.plans.find(row=>row.id==='empty-review');
  expect(plan).toMatchObject({status:'skipped',skipReason:'no-longer-due'});
  expect(plan.completedAt).toBeFalsy();
  expect(currentPath).toBe('/');
});

test.each(['add','replace'])('manual due review %s persists a numeric capacity and starts the requested mode',async type=>{
  const entry=addVocabularyItem(mocks.initial,{id:'manual-review-word',term:'persistent',meaning:'Continuing over time.'}).item;
  recordVocabularyReview(mocks.initial,{entryId:entry.id,senseId:entry.senses[0].id,mode:'definition',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=type==='replace'?[{id:'replace-me',dateKey:'2099-01-01',status:'pending',estimatedMinutes:5}]:[];});});
  await act(async()=>{expect(await fieldbook.changePlan(type==='replace'?'replace-me':null,{type,skill:'vocabulary',practice:'due-review',assessmentMode:'definition',estimatedMinutes:5,dateKey:'2099-01-01',allowOverBudget:true})).toBe(true);});
  const plan=fieldbook.state.plans[0];
  expect(plan).toMatchObject({estimatedMinutes:5,quantity:5,target:{assessmentMode:'definition',batchSize:5,binding:'dynamic'}});
  await act(async()=>{expect(await fieldbook.startPlan(plan.id)).toBe(true);});
  expect(fieldbook.state.plans[0].target.cards).toEqual([{entryId:entry.id,senseId:entry.senses[0].id}]);
});

test('manual specialist recall remains startable when deliberately selected',async()=>{
  const entry=addVocabularyItem(mocks.initial,{id:'specialist-word',term:'reliable',meaning:'Able to be trusted.',example:'The railway provides a reliable service.',synonyms:['dependable']}).item;
  recordVocabularyReview(mocks.initial,{entryId:entry.id,senseId:entry.senses[0].id,mode:'cloze',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[];});});
  await act(async()=>{expect(await fieldbook.changePlan(null,{type:'add',skill:'vocabulary',practice:'due-review',assessmentMode:'cloze',estimatedMinutes:5,dateKey:'2099-01-01',allowOverBudget:true})).toBe(true);});
  const id=fieldbook.state.plans[0].id;
  await act(async()=>{expect(await fieldbook.startPlan(id)).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({status:'in_progress',target:{assessmentMode:'cloze',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}});
});

test('dynamic start takes distinct words before applying capacity and retains priority',async()=>{
  const first=addVocabularyItem(mocks.initial,{id:'a',term:'harbor',senses:[{id:'one',definition:'A sheltered port.',example:'',pos:'noun'},{id:'two',definition:'To shelter something.',example:'',pos:'verb'}]}).item;
  const second=addVocabularyItem(mocks.initial,{id:'b',term:'beacon',meaning:'A guiding light.'}).item;
  for(const entry of [first,second])for(const sense of entry.senses)recordVocabularyReview(mocks.initial,{entryId:entry.id,senseId:sense.id,mode:'definition',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  const plan={id:'distinct',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:2,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'definition',batchSize:2,cards:[]}};
  await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[plan];});});
  await act(async()=>{expect(await fieldbook.startPlan(plan.id)).toBe(true);});
  expect(fieldbook.state.plans[0].target.cards).toEqual([{entryId:'a',senseId:'one'},{entryId:'b',senseId:second.senses[0].id}]);
});

test('resizing a dynamic review updates prompt capacity, charged budgets, and actual start count',async()=>{
  for(let i=0;i<10;i++){addVocabularyItem(mocks.initial,{id:`resize-${i}`,term:`word${i}`,meaning:'A meaning.'});}
  for(const state of mocks.initial.vocabularyStates)state.manualStatus='unfamiliar';
  await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.settings.days=[1,2,3,4,5,6,7];draft.settings.dailyMinutes=12;draft.settings.planning.vocabularyMode='fixed';draft.settings.planning.vocabularyMinutes=2;draft.plans=[{id:'resize',dateKey:'2099-01-01',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:10,quantity:10,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'definition',batchSize:10,cards:[]}}];});});
  await act(async()=>{expect(await fieldbook.changePlan('resize',{type:'resize',estimatedMinutes:2})).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({estimatedMinutes:2,quantity:2,target:{batchSize:2}});
  const budget=studyBudget(fieldbook.state.settings,'2099-01-01');
  expect(fieldbook.state.plans.reduce((sum,row)=>sum+row.estimatedMinutes,0)).toBeLessThanOrEqual(budget.daily);
  expect(fieldbook.state.plans.filter(row=>row.skill==='vocabulary').reduce((sum,row)=>sum+row.estimatedMinutes,0)).toBe(budget.vocabulary);
  await act(async()=>{expect(await fieldbook.startPlan('resize')).toBe(true);});
  expect(fieldbook.state.plans[0].target.cards).toHaveLength(2);
});

test('empty review save failure and restore retain dynamic semantics for newly eligible words',async()=>{
  const plan={id:'empty-restorable',dateKey:'2099-01-01',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:2,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'definition',batchSize:2,cards:[]}};
  await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[plan];});});
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.startPlan(plan.id)).toBe(false);});
  expect(fieldbook.state.plans[0]).toEqual(plan);
  await act(async()=>{expect(await fieldbook.startPlan(plan.id)).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({status:'skipped',skipReason:'no-longer-due',target:{binding:'dynamic',cards:[]}});
  await act(async()=>{expect(await fieldbook.changePlan(plan.id,{type:'restore',allowOverBudget:true})).toBe(true);await fieldbook.persist(draft=>{const entry=addVocabularyItem(draft,{id:'newly-due',term:'beacon',meaning:'A guiding light.'}).item;draft.vocabularyStates.find(row=>row.entryId===entry.id).manualStatus='unfamiliar';});});
  await act(async()=>{expect(await fieldbook.startPlan(plan.id)).toBe(true);});
  expect(fieldbook.state.plans[0]).toMatchObject({status:'in_progress',target:{binding:'frozen',cards:[{entryId:'newly-due'}]}});
});

test('a prospective book-wide learning ordinal resolves across eligible group batches',async()=>{
  const groups=[{id:'ordinal-first',bookId:'ordinal-book',kind:'group',order:1,entryIds:[]},{id:'ordinal-second',bookId:'ordinal-book',kind:'group',order:2,entryIds:[]}];
  const members=[];
  for(let i=0;i<13;i++){const entry=addVocabularyItem(mocks.initial,{id:`ordinal-${i}`,term:`ordinal${i}`,meaning:'A meaning.'}).item;if(i<3)entry.tags.push('archived');const group=groups[i<12?0:1];group.entryIds.push(entry.id);members.push({id:`ordinal-member-${i}`,entryId:entry.id,bookId:group.bookId,unitId:group.id,order:i});}
  VOCABULARY_CATALOG.units.push(...groups);VOCABULARY_CATALOG.memberships.push(...members);
  try {
    await mount('/planning');
    await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[{id:'ordinal-plan',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:10,target:{type:'vocabulary',mode:'learning-batch',bookId:'ordinal-book',assessmentMode:'definition',batchIndex:1,batchSize:10,cards:[]}}];});});
    await act(async()=>{expect(await fieldbook.startPlan('ordinal-plan')).toBe(true);});
    expect(fieldbook.state.plans[0]).toMatchObject({status:'in_progress',target:{unitId:'ordinal-second',batchIndex:0,cards:[{entryId:'ordinal-12'}]}});
  }finally{VOCABULARY_CATALOG.units=VOCABULARY_CATALOG.units.filter(group=>group.bookId!=='ordinal-book');VOCABULARY_CATALOG.memberships=VOCABULARY_CATALOG.memberships.filter(member=>member.bookId!=='ordinal-book');}
});

test('frozen legacy reviews load requested resources and remain retryable after failure',async()=>{
  const entry=addVocabularyItem(mocks.initial,{term:'persistent',meaning:'Continuing over time.'}).item;
  mocks.initial.plans=[{id:'legacy-review',kind:'vocabulary',skill:'vocabulary',status:'pending',target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}}];
  await mount('/');
  mocks.releasedRead.mockRejectedValueOnce(new Error('Offline'));
  mocks.teachingRead.mockRejectedValueOnce(new Error('Offline'));
  await act(async()=>{await expect(fieldbook.startPlan('legacy-review')).rejects.toThrow('Offline');});
  expect(fieldbook.state.plans[0].status).toBe('pending');
  await act(async()=>{expect(await fieldbook.startPlan('legacy-review',{force:true})).toBe(true);});
  expect(mocks.releasedRead).toHaveBeenCalledWith(expect.objectContaining({entryIds:[entry.id],force:true}));
});

test.each(['due-review','learning-batch'])('dynamic reviews reserve exact pairs by mode without changing existing frozen %s targets',async reservedMode=>{
  const first=addVocabularyItem(mocks.initial,{id:'first',term:'first',meaning:'The first meaning.'}).item;
  const second=addVocabularyItem(mocks.initial,{id:'second',term:'second',meaning:'The second meaning.'}).item;
  for(const learning of mocks.initial.vocabularyStates)learning.manualStatus='unfamiliar';
  const frozen={id:'reserved',kind:'vocabulary',skill:'vocabulary',status:'pending',target:{type:'vocabulary',mode:reservedMode,assessmentMode:'dictation',cards:[{entryId:first.id,senseId:first.senses[0].id}]}};
  const dynamic={id:'dynamic',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:10,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',batchSize:1,assessmentMode:'dictation',cards:[]}};
  mocks.initial.plans=[frozen,dynamic];await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[structuredClone(frozen),structuredClone(dynamic)];});});
  await act(async()=>{expect(await fieldbook.startPlan('dynamic')).toBe(true);});
  expect(fieldbook.state.plans[0]).toEqual(frozen);
  expect(fieldbook.state.plans[1].target.cards).toEqual([{entryId:second.id,senseId:second.senses[0].id}]);
});

test.each(['invalid',0,-1,10001,Infinity])('invalid dynamic review capacity %s remains retryable instead of being skipped',async(batchSize)=>{
  mocks.initial.plans=[{id:'bad-capacity',kind:'vocabulary',status:'pending',target:{type:'vocabulary',mode:'due-review',binding:'dynamic',batchSize,assessmentMode:'definition',cards:[]}}];
  await mount('/planning');
  await act(async()=>{await expect(fieldbook.startPlan('bad-capacity')).rejects.toThrow(/capacity|size/i);});
  expect(fieldbook.state.plans.find(plan=>plan.id==='bad-capacity').status).toBe('pending');
});

test('concurrent dynamic review starts reserve different pairs at durable save time',async()=>{
  addVocabularyItem(mocks.initial,{id:'first',term:'first',meaning:'The first meaning.'});
  addVocabularyItem(mocks.initial,{id:'second',term:'second',meaning:'The second meaning.'});
  for(const learning of mocks.initial.vocabularyStates)learning.manualStatus='unfamiliar';
  const plans=['one','two'].map(id=>({id,kind:'vocabulary',skill:'vocabulary',status:'pending',target:{type:'vocabulary',mode:'due-review',binding:'dynamic',batchSize:1,assessmentMode:'dictation',cards:[]}}));
  mocks.initial.plans=structuredClone(plans);await mount('/planning');
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=structuredClone(plans);});});
  await act(async()=>{expect(await Promise.all([fieldbook.startPlan('one'),fieldbook.startPlan('two')])).toEqual([true,true]);});
  const targets=fieldbook.state.plans.map(plan=>plan.target);
  expect(targets).toHaveLength(2);
  expect(targets.every(target=>target.binding==='frozen' && target.cards.length===1)).toBe(true);
  expect(targets[0].cards).not.toEqual(targets[1].cards);
});

test('bulk backlog saves are atomic, preserve drafts on failure and reject stale previews',async()=>{
 await mount('/planning');
 await act(async()=>{await fieldbook.mutatePlans(draft=>{draft.plans=[{id:'a',dateKey:'2020-01-01',status:'pending',estimatedMinutes:10},{id:'b',dateKey:'2020-01-02',status:'in_progress',startedAt:'2020-01-02',estimatedMinutes:10}];});fieldbook.setWritingDraft('q1','Keep unsaved writing');});
 const preview=previewBacklogChange(fieldbook.state,{type:'skip',ids:['a','b'],includeStarted:true});
 mocks.saveState.mockClear();mocks.saveState.mockResolvedValueOnce(false);
 await act(async()=>{expect(await fieldbook.saveBacklogPreview(preview)).toBe(false);});
 expect(fieldbook.state.plans.map(plan=>plan.status)).toEqual(['pending','in_progress']);expect(fieldbook.draftSaveStatus('q1')).toBe('unsaved');
 await act(async()=>{expect(await fieldbook.saveBacklogPreview(preview)).toBe(true);});
 expect(fieldbook.state.plans.map(plan=>plan.status)).toEqual(['skipped','skipped']);expect(mocks.saveState).toHaveBeenCalledTimes(2);
 await act(async()=>{await expect(fieldbook.saveBacklogPreview(preview)).rejects.toThrow(/schedule changed/i);});expect(mocks.saveState).toHaveBeenCalledTimes(2);
});

function ReturnHistoryControls(){const location=useLocation(),navigate=useNavigate();return <><output aria-label="Owned history location">{location.pathname+location.search+location.hash}</output><button onClick={()=>navigate(-1)}>Browser back</button><button onClick={()=>navigate(1)}>Browser forward</button></>;}
test.each(['/today?view=overdue','/planning?view=overdue#planning-backlog'])('actual task completion returns through owned history to the focused task from %s',async source=>{
 const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});sessionStorage.clear();window.history.replaceState({idx:0},'','/sentinel');window.history.pushState({idx:1},'',source);
 mocks.initial.settings.days=[];mocks.initial.settings.vocabulary.autoPlay=false;
 const entry=addVocabularyItem(mocks.initial,{id:'return-word',term:'persistent',meaning:'Continuing over time.'}).item;
 mocks.initial.plans=[{id:'return-old',dateKey:'2020-01-01',kind:'vocabulary',skill:'vocabulary',status:'in_progress',startedAt:'2020-01-01T00:00:00Z',title:'Historical review',estimatedMinutes:120,target:{type:'vocabulary',mode:'due-review',binding:'frozen',assessmentMode:'dictation',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]}}];
 const view=render(<BrowserRouter><FieldbookProvider><Probe/><Routes><Route path="/sentinel" element={<p>Before source</p>}/><Route path="/today" element={<TodayPage/>}/><Route path="/planning" element={<PlanningPage/>}/><Route path="/vocabulary/review" element={<VocabularyPracticePage/>}/><Route path="/vocabulary/history/:sessionId" element={<VocabularyPracticePage/>}/></Routes><ReturnHistoryControls/></FieldbookProvider></BrowserRouter>);
 try {
  await waitFor(()=>expect(fieldbook.booted).toBe(true));
  if(source.startsWith('/planning')&&screen.queryByRole('button',{name:/Waiting ·/})?.getAttribute('aria-pressed')!=='true')fireEvent.click(await screen.findByRole('button',{name:/Waiting ·/}));
  fireEvent.click(await screen.findByRole('button',{name:'Resume'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  fireEvent.change(await screen.findByRole('textbox',{name:'Answer 1'}),{target:{value:'persistent'}});fireEvent.click(screen.getByRole('button',{name:'Submit session'}));
  await waitFor(()=>expect(fieldbook.state.plans.find(plan=>plan.id==='return-old').status).toBe('completed'));
  const destination=source.split('#')[0]+'#task-return-old';
  const back=await screen.findByRole('link',{name:source.startsWith('/today')?'Back to Today':'Back to Planning'});
  expect(back).toHaveAttribute('href',destination);fireEvent.click(back);
  await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent(destination));
  await waitFor(()=>expect(view.container.querySelector('#task-return-old')).toHaveFocus());
  expect(view.container.querySelector('#task-return-old')).toHaveTextContent('Completed');
  fireEvent.click(screen.getByRole('button',{name:'Browser back'}));expect(await screen.findByText('Before source')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent(destination));
 }finally{view.unmount();scroll.mockRestore();window.history.replaceState({},'','/');}
});

function DelayedStartNavigation(){const navigate=useNavigate();return <><ReturnHistoryControls/><button onClick={()=>navigate('/planning?view=intervening',{state:{keep:'intervening'}})}>Open intervening Planning</button></>;}
test.each(['catalog','save'])('a delayed %s task start preserves an intervening browser entry and its history',async delay=>{
 const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});sessionStorage.clear();window.history.replaceState({idx:0},'','/sentinel');window.history.pushState({idx:1},'','/today?view=source');
 mocks.initial.settings.days=[];
 const entry=addVocabularyItem(mocks.initial,{id:'delayed-word',term:'persistent',meaning:'Continuing over time.'}).item;
 const target={type:'vocabulary',mode:'due-review',binding:'frozen',assessmentMode:'dictation',cards:[{entryId:entry.id,senseId:entry.senses[0].id}]};
 mocks.initial.plans=[{id:'delayed-task',dateKey:'2099-01-01',kind:'vocabulary',skill:'vocabulary',status:'pending',estimatedMinutes:120,target}];
 const view=render(<BrowserRouter><FieldbookProvider><Probe/><DelayedStartNavigation/></FieldbookProvider></BrowserRouter>);
 try {
  await waitFor(()=>expect(fieldbook.booted).toBe(true));await act(async()=>{fieldbook.setWritingDraft('q1','Keep this live draft');});
  const blocked=defer();mocks.teachingRead.mockClear();mocks.saveState.mockClear();
  if(delay==='catalog')mocks.teachingRead.mockReturnValueOnce(blocked.promise);else mocks.saveState.mockReturnValueOnce(blocked.promise);
  let starting;await act(async()=>{starting=fieldbook.startPlan('delayed-task');});
  await waitFor(()=>expect(delay==='catalog'?mocks.teachingRead:mocks.saveState).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Open intervening Planning'}));
  expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/planning?view=intervening');
  const intervening=structuredClone(window.history.state);
  await act(async()=>{blocked.resolve(delay==='catalog'?{books:[],units:[],entries:[],memberships:[]}:true);await starting;});
  expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/planning?view=intervening');expect(window.history.state).toEqual(intervening);
  expect(fieldbook.state.plans.find(plan=>plan.id==='delayed-task')).toMatchObject({status:'in_progress',target});
  expect(fieldbook.state.drafts.q1.text).toBe('Keep this live draft');expect(fieldbook.state.vocabularySessions).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Browser back'}));await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/today?view=source'));expect(window.location.hash).toBe('');
  fireEvent.click(screen.getByRole('button',{name:'Browser back'}));await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/sentinel'));
  fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/today?view=source'));
  fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));await waitFor(()=>expect(screen.getByLabelText('Owned history location')).toHaveTextContent('/planning?view=intervening'));expect(window.history.state).toEqual(intervening);
 }finally{view.unmount();scroll.mockRestore();window.history.replaceState({},'','/');}
});


test.each(['due-review','learning-batch'])('settings save uses canonical regeneration and preserves frozen %s targets through queued replay',async mode=>{
  mocks.initial.settings.days=[1,2,3,4,5,6,7];mocks.initial.settings.skills=['writing'];
  await mount();
  const frozen={id:'settings-frozen',dateKey:'2099-01-01',origin:'automatic',status:'pending',kind:'vocabulary',skill:'vocabulary',estimatedMinutes:1,target:{type:'vocabulary',binding:'frozen',mode,assessmentMode:'definition',cards:[{entryId:'word',senseId:'sense'}]},draft:{answer:'Keep the frozen answer'}};
  const carry={id:'settings-carry',dateKey:'2000-01-01',origin:'automatic',status:'pending',kind:'1',skill:'writing',estimatedMinutes:10,target:{type:'question',skill:'writing',questionId:'q1',mode:'overview'}};
  const started={...carry,id:'settings-started',dateKey:'2099-01-01',status:'in_progress',startedAt:'2026-10-01T00:00:00Z',draft:{text:'Keep started work'}};
  const staleReview={...frozen,id:'settings-stale',dateKey:'2000-01-01',target:{...frozen.target,mode:'due-review',binding:'dynamic',cards:[]}};
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans.push(frozen,carry,staleReview,started);draft.activePlanId=staleReview.id;});});
  const before=structuredClone(fieldbook.state),expected=structuredClone(before);expected.settings.dailyMinutes=60;ensureUnifiedPlans(expected);
  mocks.saveState.mockResolvedValueOnce(false);
  await act(async()=>{expect(await fieldbook.saveStudySettings({dailyMinutes:60})).toBe(false);});
  expect(fieldbook.state).toEqual(before);
  mocks.saveState.mockClear();const pending=defer();mocks.saveState.mockReturnValueOnce(pending.promise);
  let saving,autosave;await act(async()=>{saving=fieldbook.saveStudySettings({dailyMinutes:60});});
  await waitFor(()=>expect(mocks.saveState).toHaveBeenCalledTimes(1));
  await act(async()=>{autosave=fieldbook.persist(draft=>{draft.drafts.q1.text='Typed while settings saved';});});
  await act(async()=>{pending.resolve(true);expect(await saving).toBe(true);await autosave;});
  const saved=mocks.saveState.mock.calls.at(-1)[0];
  expect(saved.plans.find(plan=>plan.id===frozen.id)).toEqual(frozen);
  expect(fieldbook.state.plans.find(plan=>plan.id===frozen.id)).toEqual(frozen);
  expect(saved.plans.find(plan=>plan.id===started.id)).toEqual(started);
  expect(fieldbook.state.plans.find(plan=>plan.id===started.id)).toEqual(started);
  expect(fieldbook.state.plans.find(plan=>plan.id===carry.id)).toMatchObject({originalDateKey:carry.dateKey,target:carry.target});
  // Target binding adds resource details after generation; rotation and schedule must remain identical.
  const schedule=plans=>plans.map(({id,dateKey,kind,skill,rotationIndex,estimatedMinutes})=>({id,dateKey,kind,skill,rotationIndex,estimatedMinutes})).sort((a,b)=>a.id.localeCompare(b.id));
  expect(schedule(saved.plans)).toEqual(schedule(expected.plans));
  expect(schedule(fieldbook.state.plans)).toEqual(schedule(expected.plans));
  expect(fieldbook.state.drafts.q1.text).toBe('Typed while settings saved');
  expect(saved.activePlanId).toBeNull();expect(fieldbook.state.activePlanId).toBeNull();
  expect(fieldbook.state.plans.find(plan=>plan.id===staleReview.id)).toMatchObject({status:'skipped',skipReason:'merged-review',target:staleReview.target});
});


test('a vocabulary-only settings rebuild commits newly generated tasks when every existing task is protected',async()=>{
  mocks.initial.settings.days=[1,2,3,4,5,6,7];mocks.initial.settings.skills=['writing'];
  await mount();
  const frozen={id:'only-frozen',dateKey:'2099-01-01',origin:'automatic',status:'pending',kind:'vocabulary',skill:'vocabulary',estimatedMinutes:1,target:{type:'vocabulary',binding:'frozen',mode:'due-review',assessmentMode:'dictation',cards:[{entryId:'word',senseId:'sense'}]}};
  await act(async()=>{await fieldbook.persist(draft=>{draft.plans=[frozen];});});
  mocks.saveState.mockClear();
  await act(async()=>{expect(await fieldbook.saveStudySettings({vocabulary:{mode:'definition'}})).toBe(true);});
  const saved=mocks.saveState.mock.calls.at(-1)[0];
  expect(saved.plans.length).toBeGreaterThan(1);
  expect(fieldbook.state.plans).toEqual(saved.plans);
  expect(fieldbook.state.plans.find(plan=>plan.id===frozen.id)).toEqual(frozen);
  expect(fieldbook.state.settings.vocabulary.mode).toBe('definition');
});
