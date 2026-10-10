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
      return { data: { session: { user: { id } } }, error: null };
    } },
    rpc: async (name, args) => { mocks.rpcCalls.push({ name, args: structuredClone(args) }); if (mocks.rpcPromise) await mocks.rpcPromise; return { error: mocks.rpcError, data: mocks.rpcResult }; },
    from: (table) => ({
      select: () => {
        let rows = mocks.rows[table] || [];
        const query = {
          range: async (from, to) => { mocks.reads.push(table); return { data: structuredClone(rows.slice(from, to + 1)), error: null }; },
          eq: (key, value) => { rows = rows.filter(row => (key.startsWith('payload->>') ? row.payload?.[key.slice(10)] : row[key]) === value); return query; },
          in: (key, values) => { rows = rows.filter(row => values.includes(row[key])); return query; },
          order: () => { rows = rows.slice().sort((left, right) => String(left.id).localeCompare(String(right.id))); return query; },
          maybeSingle: async () => ({ data: structuredClone(mocks.profile), error: null }),
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
  mocks.rpcError = null;
  mocks.rpcResult = null;
  mocks.rpcPromise = null;
  mocks.reads = [];
  mocks.failTable = null;
  mocks.user = 'account-1';
  mocks.sessions = [];
});

test('in-place changes after hydration produce plan and draft upserts with actual v10 metadata', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state.schemaVersion).toBe(10);
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

test('failed save can retry the same payload and successful duplicate save does not rewrite rows', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  state.sessions.push({ id: 'attempt-1', skill: 'writing', essay: 'Candidate response.', practiceMode: 'full', targetErrorIds: ['target-1'] });
  state.errors.push({ id: 'attempt-1-manual-error-0', sourceSessionId: 'attempt-1', code: 'TA-DATA', text: 'Wrong figure.' });
  state.plans[0].status = 'completed';
  mocks.failTable = 'plans';
  expect(await saveState(state)).toBe(false);
  const firstErrors = mocks.upserts.find(call => call.table === 'errors').rows;
  mocks.upserts = [];
  mocks.failTable = null;
  expect(await saveState(state)).toBe(true);
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
  expect(current.schemaVersion).toBe(10);
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
