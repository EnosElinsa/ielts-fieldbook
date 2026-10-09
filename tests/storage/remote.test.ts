// @ts-nocheck
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: {}, upserts: [], failTable: null, profile: { settings: {}, active_plan_id: null, reviewed_at: null }, user: 'account-1', sessions: [] }));
vi.mock('../../src/lib/supabase', () => ({
  supabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getSession: async () => {
      const next = mocks.sessions.shift();
      const id = next ? next.user : mocks.user;
      if (next && next.promise) await next.promise;
      return { data: { session: { user: { id } } }, error: null };
    } },
    from: (table) => ({
      select: () => ({
        range: async (from, to) => ({ data: structuredClone((mocks.rows[table] || []).slice(from, to + 1)), error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: structuredClone(mocks.profile), error: null }) }),
      }),
      upsert: async (rows) => {
        mocks.upserts.push({ table, rows: structuredClone(rows) });
        return { error: mocks.failTable === table ? new Error('Network failure') : null };
      },
      delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.rows = { plans: [{ id: 'p1', payload: { id: 'p1', kind: '1', status: 'pending', title: 'Practice', targetErrorIds: ['target-1'] } }], drafts: [{ id: 'q1', payload: { text: 'Before', practiceMode: 'overview', targetErrorIds: ['target-1'] } }] };
  mocks.upserts = [];
  mocks.failTable = null;
  mocks.user = 'account-1';
  mocks.sessions = [];
});

test('in-place changes after hydration produce plan and draft upserts with actual v9 metadata', async () => {
  const { hydrateState, saveState } = await import('../../src/storage/remote');
  const state = await hydrateState();
  expect(state.schemaVersion).toBe(9);
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
  expect(current.schemaVersion).toBe(9);
  await actResolve(old, true);
  await expect(oldLoad).rejects.toThrow('superseded');
});

async function actResolve(deferred, value) {
  deferred.resolve(value);
  await Promise.resolve();
  await Promise.resolve();
}
