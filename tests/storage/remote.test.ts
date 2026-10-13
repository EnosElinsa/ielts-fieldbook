// @ts-nocheck
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: {}, upserts: [], deletes: [], rpcCalls: [], rpcError: null, rpcResult: null, rpcPromise: null, reads: [], failTable: null, profile: { settings: {}, active_plan_id: null, reviewed_at: null }, user: 'account-1', sessions: [] }));
vi.mock('../../src/lib/supabase', () => ({
  supabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getSession: async () => {
      const next = mocks.sessions.shift();
      const id = next ? next.user : mocks.user;
      if (next && next.promise) await next.promise;
      return { data: { session: { user: { id }, access_token: `test-token-${id}` } }, error: null };
    } },
    rpc: (name, args) => {
      const response = (async () => {
      mocks.rpcCalls.push({ name, args: structuredClone(args) });
      if (mocks.rpcPromise) await mocks.rpcPromise;
      if (name === 'commit_workspace_changes') {
        const tables = (await import('../../src/storage/sync')).USER_TABLES;
        const changes = { ...args.batch.lists, ...(args.batch.drafts ? { drafts: args.batch.drafts } : {}) };
        // Project the transaction request into rows to keep the existing payload assertions.
        for (const [key, diff] of Object.entries(changes)) {
          const table = tables[key] || key;
          if (diff.upserts.length) mocks.upserts.push({ table, rows: structuredClone(diff.upserts.map(row => ({ ...row, user_id: mocks.user }))) });
          if (diff.deletes.length) mocks.deletes.push({ table, userId: mocks.user, ids: [...diff.deletes] });
        }
        return { error: mocks.rpcError || (mocks.failTable ? new Error('Rejected transaction') : null), data: mocks.workspaceResult || { id: args.batch.id, alreadyCommitted: false } };
      }
      return { error: mocks.rpcError, data: mocks.rpcResult };
      })();
      response.setHeader = (header, value) => {
        mocks.headers.push({ name, header, value });
        return response;
      };
      return response;
    },
    from: (table) => ({
      select: () => {
        let rows = mocks.rows[table] || [];
        const query = {
          range: async (from, to) => {
            mocks.reads.push(table);
            if (mocks.readPromises[table]) await mocks.readPromises[table];
            return { data: structuredClone(rows.slice(from, to + 1)), error: mocks.readError === table ? new Error('Read failed') : null };
          },
          eq: (key, value) => { rows = rows.filter(row => (key.startsWith('payload->>') ? row.payload?.[key.slice(10)] : row[key]) === value); return query; },
          in: (key, values) => { rows = rows.filter(row => values.includes(row[key])); return query; },
          order: () => { rows = rows.slice().sort((left, right) => String(left.id).localeCompare(String(right.id))); return query; },
          maybeSingle: async () => ({ data: structuredClone(table === 'profiles' ? mocks.profile : rows[0] || null), error: null }),
        };
        return query;
      },
      upsert: async (rows) => {
        mocks.upserts.push({ table, rows: structuredClone(rows) });
        return { error: mocks.failTable === table ? new Error('Network failure') : null };
      },
      delete: () => ({ eq: (_key, userId) => ({ in: async (_field, ids) => { mocks.deletes.push({ table, userId, ids: [...ids] }); return { error: null }; } }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.rows = { plans: [{ id: 'p1', payload: { id: 'p1', kind: '1', status: 'pending', title: 'Practice', targetErrorIds: ['target-1'] } }], drafts: [{ id: 'q1', payload: { text: 'Before', practiceMode: 'overview', targetErrorIds: ['target-1'] } }] };
  mocks.upserts = [];
  mocks.deletes = [];
  mocks.rpcCalls = [];
  mocks.headers = [];
  mocks.rpcError = null;
  mocks.rpcResult = null;
  mocks.rpcPromise = null;
  mocks.workspaceResult = null;
  mocks.reads = [];
  mocks.readPromises = {};
  mocks.readError = null;
  mocks.failTable = null;
  mocks.user = 'account-1';
  mocks.sessions = [];
});

test.each([
  [{message:'Failed to fetch'},'Check your connection'],
  [{code:'PGRST301',message:'JWT expired'},'Sign in again'],
  [{code:'42501',message:'permission denied'},'authorize this save'],
])('workspace save failures distinguish recoverable account and connection errors',async(error,expected)=>{
  const {hydrateState,saveState}=await import('../../src/storage/remote');
  const state=await hydrateState();state.settings.dailyMinutes=60;
  mocks.rpcError=error;const feedback=vi.fn();
  expect(await saveState(state,feedback)).toBe(false);
  expect(feedback).toHaveBeenCalledWith(expect.stringContaining(expected));
});

test('base hydration reads only plans and drafts and never diffs unloaded module records', async () => {
  mocks.rows.sessions = [{ id: 'remote-session', payload: { id: 'remote-session' } }];
  const { hydrateState, saveState, getCollectionStatuses } = await import('../../src/storage/remote');
  const state = await hydrateState({ modules: [] });
  expect(mocks.reads).toEqual(['plans', 'drafts']);
  expect(getCollectionStatuses()).toMatchObject({ plans: 'ready', drafts: 'ready', profile: 'ready', sessions: 'unloaded', vocabulary: 'unloaded', examAttempts: 'unloaded' });
  state.sessions.push({ id: 'local-unloaded' });
  state.plans[0].status = 'completed';
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls[0].args.batch.lists).toHaveProperty('plans');
  expect(mocks.rpcCalls[0].args.batch.lists).not.toHaveProperty('sessions');
});

test('a queued base snapshot cannot delete collections loaded after its save scope was captured', async () => {
  mocks.rows.sessions = [{ id: 'remote-session', payload: { id: 'remote-session', skill: 'writing' } }];
  const { hydrateState, ensureAccountModule, getCollectionStatuses, saveState } = await import('../../src/storage/remote');
  const queued = await hydrateState({ modules: [] });
  const collections = Object.entries(getCollectionStatuses()).filter(([, status]) => status === 'ready').map(([key]) => key);
  queued.drafts.q1.text = 'Queued before records loaded';
  const loaded = await ensureAccountModule('productive');
  mocks.rpcError = new Error('Transient failure');
  expect(await saveState(queued, undefined, { collections })).toBe(false);
  const first = mocks.rpcCalls[0].args.batch;
  expect(first.lists).toEqual({});
  mocks.rpcError = null;
  expect(await saveState(queued, undefined, { collections })).toBe(true);
  expect(mocks.rpcCalls[1].args.batch).toEqual(first);
  expect(mocks.deletes).toEqual([]);
  const current = { ...queued, ...loaded.data };
  expect(await saveState(current)).toBe(true);
  expect(mocks.rpcCalls).toHaveLength(2);
});

test('workspace and specialized writes pin the verified account session token', async () => {
  const { hydrateState, saveState, saveVocabularyImport, saveVocabularySession } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.drafts.q1.text = 'Edited';
  expect(await saveState(state)).toBe(true);
  state.vocabularyImportBatches.push({id:'token-import'});
  expect(await saveVocabularyImport(state, 'token-import')).toBe(true);
  state.vocabularySessions.push(completedVocabularySession('token-session'));
  mocks.rpcResult = {id:'token-session', alreadyCommitted:false};
  expect(await saveVocabularySession(state, 'token-session')).toBe(true);
  expect(mocks.headers).toEqual(['commit_workspace_changes', 'commit_vocabulary_import', 'commit_vocabulary_session'].map(name => ({name, header:'Authorization', value:'Bearer test-token-account-1'})));
});

test('route prefetch overlaps blocked base hydration and later module loading reuses the same reads', async () => {
  let releaseBase;
  mocks.readPromises.plans = new Promise(resolve => { releaseBase = resolve; });
  mocks.rows.sessions = [{id:'prefetched-session', payload:{id:'prefetched-session', skill:'writing'}}];
  const { hydrateState, ensureAccountModule, getCollectionStatuses } = await import('../../src/storage/remote');
  let resolved = false;
  const base = hydrateState({modules:[], prefetchModules:['productive','productive']}).then(state => { resolved = true; return state; });
  await vi.waitFor(() => expect(mocks.reads).toContain('sessions'));
  expect(resolved).toBe(false);
  expect(getCollectionStatuses().sessions).toBe('unloaded');
  releaseBase();
  const state = await base;
  expect(state.sessions).toEqual([]);
  const loaded = await ensureAccountModule('productive');
  expect(loaded.data.sessions[0].id).toBe('prefetched-session');
  expect(mocks.reads.filter(table => table === 'sessions')).toHaveLength(1);
});

test('prefetched vocabulary remains excluded from saves until consumed and includes legacy lexicon', async () => {
  mocks.rows.lexicon = [{id:'legacy', payload:{id:'legacy',term:'adapt'}}];
  const { hydrateState, ensureAccountModule, saveState, getCollectionStatuses } = await import('../../src/storage/remote');
  const state = await hydrateState({modules:[],prefetchModules:['vocabulary']});
  expect(getCollectionStatuses().vocabulary).toBe('unloaded');
  state.drafts.q1.text = 'Base edit';
  state.vocabulary = [{id:'unloaded-local',term:'mitigate'}];
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls[0].args.batch.lists).not.toHaveProperty('vocabulary');
  const { data } = await ensureAccountModule('vocabulary');
  expect(data.vocabulary[0].term).toBe('adapt');
  expect(mocks.reads.filter(table => table === 'lexicon')).toHaveLength(1);
});

test('prefetch rows cannot cross an account reset even if the old request finishes later', async () => {
  let release;
  mocks.readPromises.sessions = new Promise(resolve => { release = resolve; });
  mocks.rows.sessions = [{id:'old',payload:{id:'old'}}];
  const { hydrateState, ensureAccountModule, resetAccountStore } = await import('../../src/storage/remote');
  await hydrateState({modules:[],prefetchModules:['productive']});
  resetAccountStore();
  mocks.user = 'account-2';
  mocks.rows.sessions = [{id:'new',payload:{id:'new'}}];
  delete mocks.readPromises.sessions;
  await hydrateState({modules:[],prefetchModules:['productive']});
  release();
  const loaded = await ensureAccountModule('productive');
  expect(loaded.data.sessions.map(row => row.id)).toEqual(['new']);
});

test('unused failed prefetch leaves base usable and module retry starts fresh reads', async () => {
  mocks.readError = 'sessions';
  const { hydrateState, ensureAccountModule, getCollectionStatuses } = await import('../../src/storage/remote');
  const state = await hydrateState({modules:[],prefetchModules:['productive']});
  expect(state.plans).toHaveLength(1);
  expect(getCollectionStatuses().sessions).toBe('unloaded');
  mocks.readError = null;
  await ensureAccountModule('productive');
  expect(mocks.reads.filter(table => table === 'sessions')).toHaveLength(2);
});

test('bank prefetch waits for verified identity, overlaps base load, and leaves base banks empty', async () => {
  let releaseSession, releaseBase;
  const verified = new Promise(resolve => { releaseSession = resolve; });
  mocks.sessions.push({user:'account-1',promise:verified});
  mocks.readPromises.plans = new Promise(resolve => { releaseBase = resolve; });
  mocks.rows.writing_questions = [{id:'q',payload:{title:'Question'}}];
  const { hydrateState, ensureQuestionBank } = await import('../../src/storage/remote');
  const loading = hydrateState({modules:[],prefetchBanks:['writing','writing']});
  await Promise.resolve();
  expect(mocks.reads).not.toContain('writing_questions');
  releaseSession();
  await vi.waitFor(() => expect(mocks.reads).toContain('writing_questions'));
  releaseBase();
  const base = await loading;
  expect(base.questions).toEqual([]);
  expect(await ensureQuestionBank('writing')).toEqual([{id:'q',title:'Question'}]);
  expect(mocks.reads.filter(table => table === 'writing_questions')).toHaveLength(1);
});

test('bank prefetch failure does not block base hydration and a later bank read retries', async () => {
  mocks.readError = 'writing_questions';
  const { hydrateState, ensureQuestionBank } = await import('../../src/storage/remote');
  const base = await hydrateState({modules:[],prefetchBanks:['writing']});
  expect(base.plans).toHaveLength(1);
  expect(base.questions).toEqual([]);
  await vi.waitFor(() => expect(mocks.reads).toContain('writing_questions'));
  await expect(ensureQuestionBank('writing')).rejects.toThrow('Read failed');
  mocks.readError = null;
  mocks.rows.writing_questions = [{id:'q',payload:{title:'Retry'}}];
  expect(await ensureQuestionBank('writing')).toEqual([{id:'q',title:'Retry'}]);
  expect(mocks.reads.filter(table => table === 'writing_questions')).toHaveLength(2);
});

test('module loads deduplicate in flight and normalize only their own collections', async () => {
  mocks.rows.sessions = [{ id: 'session', payload: { id: 'session', skill: 'writing' } }];
  const { hydrateState, ensureAccountModule } = await import('../../src/storage/remote');
  await hydrateState({ modules: [] });
  mocks.reads = [];
  const [first, second] = await Promise.all([ensureAccountModule('productive'), ensureAccountModule('productive')]);
  expect(first).toEqual(second);
  expect(Object.keys(first.data)).toEqual(['sessions', 'assessments', 'errors', 'stories']);
  expect(first.data.sessions[0].id).toBe('session');
  expect(mocks.reads).toEqual(['sessions', 'assessments', 'errors', 'stories']);
  await ensureAccountModule('productive');
  expect(mocks.reads).toHaveLength(4);
});

test('failed module reads remain unloaded for saving and can be retried', async () => {
  const { hydrateState, ensureAccountModule, getCollectionStatuses, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState({ modules: [] });
  mocks.readError = 'sessions';
  await expect(ensureAccountModule('productive')).rejects.toThrow('Read failed');
  expect(getCollectionStatuses().sessions).toBe('error');
  state.sessions = [{ id: 'unsafely-loaded' }];
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls).toEqual([]);
  mocks.readError = null;
  await ensureAccountModule('productive');
  expect(getCollectionStatuses().sessions).toBe('ready');
});

test('an old module read cannot publish into a replacement account', async () => {
  const { hydrateState, ensureAccountModule, resetAccountStore, getCollectionStatuses } = await import('../../src/storage/remote');
  await hydrateState({ modules: [] });
  let resolve;
  mocks.readPromises.sessions = new Promise(done => { resolve = done; });
  const loading = ensureAccountModule('productive');
  resetAccountStore();
  mocks.user = 'account-2';
  await hydrateState({ modules: [] });
  resolve();
  await expect(loading).rejects.toThrow('superseded');
  expect(getCollectionStatuses().sessions).toBe('unloaded');
});

test('only the correct transaction acknowledgement advances the snapshot', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState({ modules: [] });
  state.drafts.q1.text = 'Changed';
  mocks.workspaceResult = { id: 'wrong-operation', alreadyCommitted: false };
  expect(await saveState(state)).toBe(false);
  const batch = mocks.rpcCalls[0].args.batch;
  mocks.workspaceResult = null;
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls[1].args.batch).toEqual(batch);
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls).toHaveLength(2);
});

test('public banks and samples deduplicate and samples load by requested topic only', async () => {
  mocks.rows.writing_questions = [{ id: 'q', payload: { title: 'Writing' } }];
  mocks.rows.speaking_samples = [{ id: 'topic-1', payload: { answer: 'One' } }, { id: 'topic-2', payload: { answer: 'Two' } }];
  const { hydrateState, ensureQuestionBank, ensureSpeakingSample } = await import('../../src/storage/remote');
  await hydrateState({ modules: [] });
  mocks.reads = [];
  expect(await ensureQuestionBank('writing')).toEqual([{ id: 'q', title: 'Writing' }]);
  await ensureQuestionBank('writing');
  expect(mocks.reads).toEqual(['writing_questions']);
  expect(await ensureSpeakingSample('topic-2')).toEqual({ id: 'topic-2', answer: 'Two' });
});

test('complete account loading includes unloaded modules and excludes public catalogs', async () => {
  mocks.rows.lexicon = [{ id: 'legacy', payload: { id: 'legacy', term: 'adapt' } }];
  const { hydrateState, ensureCompleteAccount, getCollectionStatuses } = await import('../../src/storage/remote');
  await hydrateState({ modules: [] });
  mocks.reads = [];
  const complete = await ensureCompleteAccount();
  expect(complete.vocabulary[0].term).toBe('adapt');
  expect(Object.values(getCollectionStatuses()).every(status => status === 'ready')).toBe(true);
  expect(mocks.reads).not.toContain('writing_questions');
  expect(mocks.reads).not.toContain('speaking_samples');
  expect(mocks.reads).toContain('exam_attempts');
});

test('a workspace response from the old generation never acknowledges the new account', async () => {
  const { hydrateState, resetAccountStore, saveState } = await import('../../src/storage/remote');
  const first = await hydrateState({ modules: [] });
  first.plans[0].status = 'completed';
  let resolve;
  mocks.rpcPromise = new Promise(done => { resolve = done; });
  const saving = saveState(first);
  await Promise.resolve();
  await Promise.resolve();
  resetAccountStore();
  mocks.user = 'account-2';
  const second = await hydrateState({ modules: [] });
  resolve();
  expect(await saving).toBe(false);
  mocks.rpcPromise = null;
  second.plans[0].status = 'completed';
  expect(await saveState(second)).toBe(true);
  expect(mocks.rpcCalls[1].args.batch.lists.plans.upserts).toHaveLength(1);
});

test('changes made while a workspace RPC is pending remain available for the next save', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState({ modules: [] });
  state.drafts.q1.text = 'First edit';
  let resolve;
  mocks.rpcPromise = new Promise(done => { resolve = done; });
  const saving = saveState(state);
  await Promise.resolve();
  await Promise.resolve();
  state.drafts.q1.text = 'Second edit';
  resolve();
  expect(await saving).toBe(true);
  mocks.rpcPromise = null;
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls[1].args.batch.drafts.upserts[0].payload.text).toBe('Second edit');
});

test('in-place changes after hydration produce plan and draft upserts with current metadata', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state.schemaVersion).toBe(12);
  state.plans[0].status = 'in_progress';
  state.plans[0].startedAt = '2026-10-10T00:00:00.000Z';
  state.drafts.q1.text = 'After';
  state.drafts.q1.targetErrorIds.push('target-2');
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'plans').rows[0]).toMatchObject({ user_id: 'account-1', id: 'p1', payload: { status: 'in_progress', startedAt: '2026-10-10T00:00:00.000Z', targetErrorIds: ['target-1'] } });
  expect(mocks.upserts.find(call => call.table === 'drafts').rows[0]).toMatchObject({ user_id: 'account-1', id: 'q1', payload: { text: 'After', practiceMode: 'overview', targetErrorIds: ['target-1', 'target-2'] } });
  mocks.upserts = [];
  state.plans[0].status = 'completed';
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'plans').rows[0].payload.status).toBe('completed');
});

test('exam hydration and retries persist separate account rows without creating writing sessions', async () => {
  const stamp = '2026-10-11T00:00:00.000Z';
  mocks.rows.exam_attempts = [{ id: 'exam-1', payload: { id: 'exam-1', skill: 'reading', sourceId: 'paper', sectionIds: ['section'], mode: 'practice', status: 'active', responses: { q: 'before' }, evidence: {}, keywords: {}, errorReasons: {}, startedAt: stamp, updatedAt: stamp, hintsEnabled: true, elapsedSeconds: 0 } }];
  mocks.rows.intensive_sessions = [{ id: 'intensive-1', payload: { id: 'intensive-1', sectionId: 'section', sentenceId: 'line', stage: 6, gist: '', transcriptInput: 'text', replayCount: 1, listened: true, revealed: false, dictationResult: 'correct', errorReasons: [], updatedAt: stamp, speed: 1, loop: false } }];
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state.sessions).toEqual([]);
  expect(state.examAttempts[0].responses.q).toBe('before');
  expect(state.intensiveSessions[0].stage).toBe(6);
  state.examAttempts[0].responses.q = 'after';
  state.intensiveSessions[0].replayCount = 2;
  mocks.failTable = 'intensive_sessions';
  expect(await saveState(state)).toBe(false);
  mocks.upserts = [];
  mocks.failTable = null;
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'exam_attempts').rows[0]).toMatchObject({ user_id: 'account-1', payload: { responses: { q: 'after' } } });
  expect(mocks.upserts.find(call => call.table === 'intensive_sessions').rows[0].payload.replayCount).toBe(2);
  expect(mocks.upserts.some(call => call.table === 'sessions')).toBe(false);
  mocks.upserts = [];
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts).toEqual([]);
});

test('failed save can retry the same payload and successful duplicate save does not rewrite rows', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.sessions.push({ id: 'attempt-1', skill: 'writing', essay: 'Candidate response.', practiceMode: 'full', targetErrorIds: ['target-1'] });
  state.errors.push({ id: 'attempt-1-manual-error-0', sourceSessionId: 'attempt-1', code: 'TA-DATA', text: 'Wrong figure.' });
  state.plans[0].status = 'completed';
  mocks.failTable = 'plans';
  expect(await saveState(state)).toBe(false);
  expect(mocks.rpcCalls).toHaveLength(1);
  expect(mocks.rpcCalls[0].name).toBe('commit_workspace_changes');
  const firstBatch = structuredClone(mocks.rpcCalls[0].args.batch);
  const firstErrors = mocks.upserts.find(call => call.table === 'errors').rows;
  mocks.upserts = [];
  mocks.failTable = null;
  expect(await saveState(state)).toBe(true);
  expect(mocks.rpcCalls[1].args.batch).toEqual(firstBatch);
  expect(mocks.upserts.find(call => call.table === 'errors').rows.map(row => row.id)).toEqual(firstErrors.map(row => row.id));
  expect(mocks.upserts.find(call => call.table === 'sessions').rows[0].payload).toEqual(state.sessions[0]);
  mocks.upserts = [];
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts).toEqual([]);
});

test('a queued account A save does not execute against account B after reset', async () => {
  const { hydrateState, saveState, resetAccountStore } = await import('../../src/storage/remote');
  await hydrateState();
  const stateA = { plans: [{ id: 'a', status: 'pending' }], drafts: {}, sessions: [], assessments: [], lexicon: [], errors: [], stories: [], settings: {}, activePlanId: null, reviewedAt: null };
  const pending = { promise: null, resolve: null };
  pending.promise = new Promise(resolve => { pending.resolve = resolve; });
  mocks.sessions.push({ user: 'account-1', promise: pending.promise });
  let saveA;
  const runA = saveState(stateA).then(value => { saveA = value; return value; });
  mocks.user = 'account-2';
  resetAccountStore();
  await actResolve(pending, true);
  await runA;
  expect(saveA).toBe(false);
  expect(mocks.upserts).toEqual([]);
});

test('a stale hydration result cannot replace a newer account snapshot', async () => {
  const { hydrateState, resetAccountStore } = await import('../../src/storage/remote');
  const old = { promise: null, resolve: null };
  old.promise = new Promise(resolve => { old.resolve = resolve; });
  mocks.sessions.push({ user: 'account-a', promise: old.promise });
  const oldLoad = hydrateState();
  resetAccountStore();
  mocks.user = 'account-b';
  const current = await hydrateState();
  expect(current.schemaVersion).toBe(12);
  await actResolve(old, true);
  await expect(oldLoad).rejects.toThrow('superseded');
});

async function actResolve(deferred, value) {
  deferred.resolve(value);
  await Promise.resolve();
  await Promise.resolve();
}

test('legacy hydration is saved into vocabulary tables without writing lexicon or fetching public vocabulary catalogs', async () => {
  mocks.rows.lexicon = [{ id: 'legacy-word', payload: { id: 'legacy-word', term: 'mitigate', meaning: 'reduce harm', reviewCount: 3 } }];
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state).not.toHaveProperty('lexicon');
  expect(state.vocabulary).toHaveLength(1);
  expect(mocks.reads).not.toContain('word_entries');
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.some(call => call.table === 'vocabulary')).toBe(true);
  expect(mocks.upserts.some(call => call.table === 'lexicon')).toBe(false);
});

test('atomic import advances only vocabulary snapshot and failed import retries the full diff', async () => {
  const { hydrateState, saveVocabularyImport, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabulary.push({ id: 'word', lemma: 'mitigate', term: 'mitigate' });
  state.vocabularyImportBatches.push({ id: 'batch-1', createdAt: '2026-10-10T00:00:00Z' });
  state.plans[0].status = 'completed';
  state.drafts.q1.text = 'Edited during import';
  mocks.rpcError = new Error('Rejected transaction');
  expect(await saveVocabularyImport(state, 'batch-1')).toBe(false);
  mocks.rpcError = null;
  expect(await saveVocabularyImport(state, 'batch-1')).toBe(true);
  expect(mocks.rpcCalls[1].args.batch.lists.vocabulary).toHaveLength(1);
  expect(mocks.rpcCalls[1].args.batch.lists).not.toHaveProperty('plans');
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.some(call => call.table === 'vocabulary')).toBe(false);
  expect(mocks.upserts.find(call => call.table === 'plans').rows[0].payload.status).toBe('completed');
  expect(mocks.upserts.find(call => call.table === 'drafts').rows[0].payload.text).toBe('Edited during import');
});

test('import acknowledges only its upserts and leaves vocabulary deletions for the workspace transaction', async () => {
  mocks.rows.vocabulary = [{ id: 'kept-word', payload: { id: 'kept-word', term: 'adapt' } }];
  const { hydrateState, saveVocabularyImport, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabulary = [{ id: 'new-word', term: 'mitigate' }];
  state.vocabularyImportBatches.push({ id: 'new-import' });
  expect(await saveVocabularyImport(state, 'new-import')).toBe(true);
  expect(await saveState(state)).toBe(true);
  const workspace = mocks.rpcCalls.find(call => call.name === 'commit_workspace_changes');
  expect(workspace?.args.batch.lists.vocabulary).toEqual({ upserts: [], deletes: ['kept-word'] });
});

test('an import awaiting authentication cannot run after an account reset', async () => {
  const { hydrateState, saveVocabularyImport, resetAccountStore } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularyImportBatches.push({ id: 'batch-1' });
  const pending = { promise: null, resolve: null };
  pending.promise = new Promise(resolve => { pending.resolve = resolve; });
  mocks.sessions.push({ user: 'account-1', promise: pending.promise });
  const importing = saveVocabularyImport(state, 'batch-1');
  resetAccountStore();
  mocks.user = 'account-2';
  await actResolve(pending, true);
  expect(await importing).toBe(false);
  expect(mocks.rpcCalls).toEqual([]);
});

test('replayed import batches do not acknowledge vocabulary edits that were not committed', async () => {
  const { hydrateState, saveVocabularyImport, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabulary.push({ id: 'new-word', term: 'mitigate' });
  state.vocabularyImportBatches.push({ id: 'existing-batch' });
  mocks.rpcResult = { id: 'existing-batch', alreadyCommitted: true };
  expect(await saveVocabularyImport(state, 'existing-batch')).toBe(true);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'vocabulary').rows[0].id).toBe('new-word');
});

test('legacy catalog query scopes normalize before remote reads and retain neutral row ids', async () => {
  const unitId='ielts-vocabulary-chapter-01-group-01';
  mocks.rows.wordbooks=[{id:'ielts-vocabulary',payload:{id:'ielts-vocabulary'}}];
  mocks.rows.wordbook_units=[{id:unitId,payload:{id:unitId,bookId:'ielts-vocabulary',sourceUnitId:'21795',kind:'group'}}];
  mocks.rows.wordbook_memberships=[{id:unitId+'-member-001',payload:{id:unitId+'-member-001',bookId:'ielts-vocabulary',unitId,entryId:'ve-x'}}];
  mocks.rows.word_entries=[{id:'ve-x',payload:{id:'ve-x',term:'word'}}];
  const {loadVocabularyCatalog}=await import('../../src/storage/remote');
  const result=await loadVocabularyCatalog({bookId:'guixue:10174',unitId:'21795'});
  expect(result.units[0]).toMatchObject({id:unitId,sourceUnitId:'21795'});
  expect(result.books[0].id).toBe('ielts-vocabulary');
  expect(result.memberships).toHaveLength(1);
});

test('lazy vocabulary catalog loads bounded selected book memberships and exact term matches', async () => {
  mocks.rows.wordbooks = [{ id: 'book', payload: { id: 'book', title: 'Selected book' } }, { id: 'other', payload: { id: 'other' } }];
  mocks.rows.wordbook_units = [{ id: 'unit', payload: { id: 'unit', bookId: 'book' } }];
  mocks.rows.wordbook_memberships = [{ id: 'm1', payload: { id: 'm1', bookId: 'book', entryId: 'word-1' } }, { id: 'm2', payload: { id: 'm2', bookId: 'book', entryId: 'word-2' } }, { id: 'm3', payload: { id: 'm3', bookId: 'other', entryId: 'word-3' } }];
  mocks.rows.word_entries = ['mitigate', 'adapt', 'unrelated'].map((term, index) => ({ id: `word-${index + 1}`, payload: { id: `word-${index + 1}`, term } }));
  const { loadVocabularyCatalog } = await import('../../src/storage/remote');
  const result = await loadVocabularyCatalog({ bookId: 'book', limit: 1 });
  expect(result.entries.map(row => row.term)).toEqual(['mitigate']);
  expect(result.memberships).toHaveLength(1);
  expect(result.nextOffset).toBe(1);
  expect((await loadVocabularyCatalog({ term: '  MITIGATE ' })).entries.map(row => row.term)).toEqual(['mitigate']);
  mocks.reads = [];
  expect((await loadVocabularyCatalog()).entries).toEqual([]);
  expect(mocks.reads).toEqual(['wordbooks']);
});

function completedVocabularySession(id = 'practice-1') {
  return { id, status: 'submitted', mode: 'learn', submittedAt: '2026-10-10T01:00:00.000Z', summary: { completed: 1, correct: 1 } };
}

test('session completion uses one atomic RPC and retries every row after failure', async () => {
  const { hydrateState, saveVocabularySession } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  state.vocabulary.push({ id: 'word-1', term: 'mitigate' });
  state.vocabularyStates.push({ id: 'word-1', vocabularyId: 'word-1', recognition: 1 });
  state.vocabularyReviews.push({ id: 'practice-1:word-1', sessionId: 'practice-1', vocabularyId: 'word-1', rating: 'good' });
  state.plans[0].status = 'completed';
  mocks.rpcError = new Error('Rejected transaction');
  const onError = vi.fn();
  expect(typeof saveVocabularySession).toBe('function');
  expect(await saveVocabularySession(state, 'practice-1', onError)).toBe(false);
  expect(onError).toHaveBeenCalledOnce();
  expect(mocks.upserts).toEqual([]);
  mocks.rpcError = null;
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: false };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(true);
  const { name, args } = mocks.rpcCalls[1];
  expect(name).toBe('commit_vocabulary_session');
  expect(args.batch).toMatchObject({ id: 'practice-1', session: { id: 'practice-1', status: 'submitted' } });
  expect(args.batch.lists.vocabulary).toEqual([{ id: 'word-1', payload: { id: 'word-1', term: 'mitigate' } }]);
  expect(args.batch.lists.vocabularyReviews).toHaveLength(1);
  expect(args.batch.lists).not.toHaveProperty('plans');
  expect(args.batch.lists).not.toHaveProperty('vocabularyImportBatches');
});

test('session commit acknowledges its upserts without acknowledging drafts, plans, or list deletions', async () => {
  mocks.rows.vocabulary = [{ id: 'kept-word', payload: { id: 'kept-word', term: 'adapt' } }];
  const { hydrateState, saveVocabularySession, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  state.vocabulary = [{ id: 'new-word', term: 'mitigate' }];
  state.plans[0].status = 'completed';
  state.drafts.q1.text = 'Live writing draft';
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: false };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(true);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.some(call => call.table === 'vocabulary')).toBe(false);
  expect(mocks.upserts.some(call => call.table === 'vocabulary_sessions')).toBe(false);
  expect(mocks.upserts.find(call => call.table === 'plans').rows[0].payload.status).toBe('completed');
  expect(mocks.upserts.find(call => call.table === 'drafts').rows[0].payload.text).toBe('Live writing draft');
  expect(mocks.deletes).toEqual([{ table: 'vocabulary', userId: 'account-1', ids: ['kept-word'] }]);
});

test('session completion never runs after authentication is superseded even by the same account', async () => {
  const { hydrateState, saveVocabularySession, resetAccountStore } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  const pending = { promise: null, resolve: null };
  pending.promise = new Promise(resolve => { pending.resolve = resolve; });
  mocks.sessions.push({ user: 'account-1', promise: pending.promise });
  const saving = saveVocabularySession(state, 'practice-1');
  resetAccountStore();
  await hydrateState();
  await actResolve(pending, true);
  expect(await saving).toBe(false);
  expect(mocks.rpcCalls).toEqual([]);
});

test('a completed session response cannot acknowledge a replacement account snapshot', async () => {
  const { hydrateState, saveVocabularySession, resetAccountStore, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  const pending = { promise: null, resolve: null };
  pending.promise = new Promise(resolve => { pending.resolve = resolve; });
  mocks.rpcPromise = pending.promise;
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: false };
  const saving = saveVocabularySession(state, 'practice-1');
  await Promise.resolve();
  await Promise.resolve();
  resetAccountStore();
  mocks.user = 'account-2';
  const replacement = await hydrateState();
  await actResolve(pending, true);
  expect(await saving).toBe(false);
  replacement.vocabulary.push({ id: 'account-2-word', term: 'adapt' });
  expect(await saveState(replacement)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'vocabulary').rows[0]).toMatchObject({ user_id: 'account-2', id: 'account-2-word' });
});

test('session replay does not acknowledge later vocabulary edits', async () => {
  const { hydrateState, saveVocabularySession, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  state.vocabulary.push({ id: 'later-word', term: 'mitigate' });
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: true };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(true);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'vocabulary').rows[0].id).toBe('later-word');
});

test('a replay followed by a new session never resends another session history', async () => {
  const { hydrateState, saveVocabularySession } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  for (const key of ['vocabularyReviews', 'vocabularyEvidence', 'vocabularyActivities']) {
    state[key].push({ id: `practice-1:${key}`, sessionId: 'practice-1' });
  }
  mocks.rpcError = { message: 'Response lost after commit' };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(false);
  mocks.rpcError = null;
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: true };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(true);
  state.vocabularySessions.push({ ...completedVocabularySession(), id: 'practice-2' });
  for (const key of ['vocabularyReviews', 'vocabularyEvidence', 'vocabularyActivities']) {
    state[key].push({ id: `practice-2:${key}`, sessionId: 'practice-2' });
  }
  mocks.rpcResult = { id: 'practice-2', alreadyCommitted: false };
  expect(await saveVocabularySession(state, 'practice-2')).toBe(true);
  for (const key of ['vocabularyReviews', 'vocabularyEvidence', 'vocabularyActivities']) {
    expect(mocks.rpcCalls.at(-1).args.batch.lists[key].map(row => row.payload.sessionId)).toEqual(['practice-2']);
  }
});

test('session completion rejects missing or unfinished session records before an RPC', async () => {
  const { hydrateState, saveVocabularySession } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [{ id: 'practice-1', status: 'active', summary: null }];
  expect(await saveVocabularySession(state, 'missing')).toBe(false);
  expect(await saveVocabularySession(state, 'practice-1')).toBe(false);
  expect(mocks.rpcCalls).toEqual([]);
});

test('adding session storage does not change the vocabulary import RPC collections', async () => {
  const { hydrateState, saveVocabularyImport } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularyImportBatches.push({ id: 'batch-1' });
  state.vocabularySessions = [completedVocabularySession()];
  expect(await saveVocabularyImport(state, 'batch-1')).toBe(true);
  expect(mocks.rpcCalls[0].args.batch.lists).not.toHaveProperty('vocabularySessions');
});

test('hydration loads submitted vocabulary history without rewriting it on an unchanged save', async () => {
  mocks.rows.vocabulary_sessions = [{ id: 'practice-1', payload: completedVocabularySession() }];
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state.vocabularySessions).toEqual([completedVocabularySession()]);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.some(call => call.table === 'vocabulary_sessions')).toBe(false);
});

test('an invalid session acknowledgement does not advance the account snapshot', async () => {
  const { hydrateState, saveVocabularySession, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  state.vocabulary.push({ id: 'not-acknowledged', term: 'adapt' });
  mocks.rpcResult = { id: 'different-session', alreadyCommitted: false };
  expect(await saveVocabularySession(state, 'practice-1')).toBe(false);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'vocabulary').rows[0].id).toBe('not-acknowledged');
});

test('edits made while the session RPC is pending remain available for a later save', async () => {
  const { hydrateState, saveVocabularySession, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.vocabularySessions = [completedVocabularySession()];
  state.vocabulary.push({ id: 'word-1', term: 'adapt' });
  const pending = { promise: null, resolve: null };
  pending.promise = new Promise(resolve => { pending.resolve = resolve; });
  mocks.rpcPromise = pending.promise;
  mocks.rpcResult = { id: 'practice-1', alreadyCommitted: false };
  const saving = saveVocabularySession(state, 'practice-1');
  await Promise.resolve();
  await Promise.resolve();
  state.vocabulary[0].term = 'later edit';
  await actResolve(pending, true);
  expect(await saving).toBe(true);
  expect(await saveState(state)).toBe(true);
  expect(mocks.upserts.find(call => call.table === 'vocabulary').rows[0].payload.term).toBe('later edit');
});
