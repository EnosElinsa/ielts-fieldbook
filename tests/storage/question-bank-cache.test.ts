import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cachedRead, clearReadCache, readSnapshot } from '../../src/lib/readCache';
import { resetAccountIdentity, setAccountIdentity } from '../../src/storage/accountIdentity';
import { ensureQuestionBank, subscribeQuestionBank } from '../../src/storage';
import { resetAccountStore } from '../../src/storage/remote';

const mock = vi.hoisted(() => ({ rows: [] as { id: number; payload: Record<string, unknown> }[], error: null as Error | null, pending: null as Promise<void> | null, calls: [] as string[] }));
vi.mock('../../src/lib/supabase', () => ({ supabaseConfigured: () => true, getSupabase: () => ({
  from: (table: string) => ({ select: () => {
    const rows = structuredClone(mock.rows);
    const error = mock.error;
    const query = { order: () => query, range: async () => { mock.calls.push(table); if (mock.pending) await mock.pending; return { data: rows, error }; } };
    return query;
  } }),
}) }));
let now = 1_000_000;
beforeEach(() => { clearReadCache(); resetAccountIdentity(); setAccountIdentity('owner'); now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); mock.rows = [{ id: 1, payload: { title: 'First', tags: ['original'] } }]; mock.error = null; mock.pending = null; mock.calls = []; });
afterEach(() => { vi.restoreAllMocks(); });

test('bank subscribers receive normalized fresh rows and stale background refresh results', async () => {
  const updates = vi.fn();
  const unsubscribe = subscribeQuestionBank('writing', updates);
  expect(updates).toHaveBeenLastCalledWith({ rows: undefined, error: undefined, loading: false });
  expect((await ensureQuestionBank('writing'))[0].id).toBe('1');
  expect(updates).toHaveBeenLastCalledWith({ rows: [{ id: '1', title: 'First', tags: ['original'] }], error: undefined, loading: false });
  now += 300_001;
  mock.rows = [{ id: 2, payload: { title: 'Refreshed' } }];
  let finish!: () => void;
  mock.pending = new Promise(resolve => { finish = resolve; });
  expect((await ensureQuestionBank('writing'))[0].title).toBe('First');
  expect(updates).toHaveBeenLastCalledWith({ rows: [{ id: '1', title: 'First', tags: ['original'] }], error: undefined, loading: true });
  finish();
  await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith({ rows: [{ id: '2', title: 'Refreshed' }], error: undefined, loading: false }));
  unsubscribe();
});

test('refresh errors preserve cached bank rows and forced retry publishes recovery', async () => {
  const updates = vi.fn();
  const unsubscribe = subscribeQuestionBank('speaking', updates);
  await ensureQuestionBank('speaking');
  now += 300_001; mock.error = new Error('offline');
  expect((await ensureQuestionBank('speaking'))[0].id).toBe('1');
  await vi.waitFor(() => expect(updates).toHaveBeenLastCalledWith({ rows: [{ id: '1', title: 'First', tags: ['original'] }], error: mock.error, loading: false }));
  mock.error = null; mock.rows = [{ id: 3, payload: { title: 'Recovered' } }];
  expect((await ensureQuestionBank('speaking', { force: true }))[0].id).toBe('3');
  expect(updates).toHaveBeenLastCalledWith({ rows: [{ id: '3', title: 'Recovered' }], error: undefined, loading: false });
  unsubscribe();
});

test('resetting even the same account isolates requests and stops old subscription publications', async () => {
  const updates = vi.fn();
  const unsubscribe = subscribeQuestionBank('writing', updates);
  let finish!: () => void;
  mock.pending = new Promise(resolve => { finish = resolve; });
  const old = ensureQuestionBank('writing');
  const assertion = expect(old).rejects.toThrow('superseded');
  await Promise.resolve();
  const notifications = updates.mock.calls.length;
  resetAccountIdentity(); setAccountIdentity('owner');
  mock.pending = null; mock.rows = [{ id: 4, payload: { title: 'New session' } }];
  await ensureQuestionBank('writing');
  finish(); await assertion;
  expect(updates).toHaveBeenCalledTimes(notifications);
  expect((await ensureQuestionBank('writing'))[0].id).toBe('4');
  unsubscribe();
});

test('returned bank rows and subscription payloads cannot mutate cached content', async () => {
  const rows = await ensureQuestionBank('writing');
  (rows[0].tags as string[]).push('edited');
  const unsubscribe = subscribeQuestionBank('writing', snapshot => { (snapshot.rows?.[0].tags as string[] | undefined)?.push('subscriber edit'); });
  expect((await ensureQuestionBank('writing'))[0].tags).toEqual(['original']);
  unsubscribe();
});

test('writing bank reads and subscriptions repair verified import defects without mutating source rows', async () => {
  const source = 'https://www.ieltscb.com/WriteQuestion/getPartWriteInfo?paper_id=121&chapters_id=1225';
  const original = { id: 1225, payload: { type: '1', source, prompt: 'Summarise the information by selecting and reporting the mail features, and make comparisons where relevant.' } };
  mock.rows = [original];
  const updates = vi.fn();
  const unsubscribe = subscribeQuestionBank('writing', updates);
  const rows = await ensureQuestionBank('writing');
  expect(rows[0].prompt).toContain('the main features');
  expect(updates.mock.calls.at(-1)?.[0].rows[0].prompt).toContain('the main features');
  expect(original.payload.prompt).toContain('the mail features');
  unsubscribe();
});

test('restoring an older workspace repairs the same imported prompts while retaining user writing', async () => {
  const { migrateState } = await import('../../src/domain');
  const raw = { questions: [{ id: '1221', source: 'https://www.ieltscb.com/WriteQuestion/getPartWriteInfo?chapters_id=1221', prompt: 'The plans below show the site ofa farm. Summarise the information byselecting and reporting the main features.' }], sessions: [{ id: 'saved', questionId: '1221', essay: 'My writing uses ofa verbatim.' }], drafts: { '1221': { text: 'My unsaved ofa draft.' } } };
  const state = migrateState(raw);
  expect(state.questions[0].prompt).toContain('site of a farm');
  expect(state.questions[0].prompt).toContain('by selecting');
  expect(state.sessions[0].essay).toBe(raw.sessions[0].essay);
  expect(state.drafts['1221'].text).toBe(raw.drafts['1221'].text);
});

test('different accounts read separate banks and unsubscribed consumers receive no refreshes', async () => {
  const updates = vi.fn();
  const unsubscribe = subscribeQuestionBank('writing', updates);
  await ensureQuestionBank('writing');
  unsubscribe();
  const notifications = updates.mock.calls.length;
  setAccountIdentity('other-owner');
  mock.rows = [{ id: 5, payload: { title: 'Other account bank' } }];
  expect((await ensureQuestionBank('writing'))[0].id).toBe('5');
  setAccountIdentity('owner');
  expect((await ensureQuestionBank('writing'))[0].id).toBe('1');
  await ensureQuestionBank('writing', { force: true });
  expect(updates).toHaveBeenCalledTimes(notifications);
  expect(mock.calls).toEqual(['writing_questions', 'writing_questions', 'writing_questions']);
});

test('resetting the account store clears retained cached reads', async () => {
  await cachedRead('account-resource', async () => 'private account data');
  resetAccountStore();
  expect(readSnapshot('account-resource').data).toBeUndefined();
});
