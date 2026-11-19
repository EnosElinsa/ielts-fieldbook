import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { beginAccountLoad, resetAccountIdentity, setAccountIdentity } from './accountIdentity';
import { loadProgressPlans } from './progressPlans';

const mock = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => mock.client }));
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const row = { id: 'historic', title: 'Saved overview', dateKey: '2026-10-13', status: 'completed' };
beforeEach(() => {
  beginAccountLoad(); setAccountIdentity('00000000-0000-4000-8000-000000000001');
  fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }));
  mock.client = createClient('https://example.test', 'synthetic-public-key', { auth: { storageKey: `audit-${crypto.randomUUID()}`, persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
});
afterEach(() => { resetAccountIdentity(); });

test('reads paged summaries with the owner, date, status and legacy skill filters', async () => {
  expect(await loadProgressPlans({ skill: 'writing', from: '2026-10-01', to: '2026-10-31', status: 'completed', offset: 20 })).toEqual({ plans: [row], total: 1, offset: 20, limit: 20 });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe('/rest/v1/plans');
  expect(url.searchParams.get('select')).toBe('id,title:payload->>title,dateKey:payload->>dateKey,status:payload->>status');
  expect(url.searchParams.get('user_id')).toBe('eq.00000000-0000-4000-8000-000000000001');
  expect(url.searchParams.getAll('payload->>dateKey')).toEqual(['lte.2026-10-31', 'gte.2026-10-01']);
  expect(url.searchParams.get('payload->>status')).toBe('eq.completed');
  expect(url.searchParams.get('or')).toContain('payload->>skill.eq.writing');
  expect(url.searchParams.get('or')).toContain('payload->>skill.is.null');
  expect(url.searchParams.get('order')).toBe('payload->>dateKey.desc,id.asc');
  expect(url.searchParams.get('offset')).toBe('20');
  expect(url.searchParams.get('limit')).toBe('20');
});

test('all-time and any-status queries leave their filters unrestricted', async () => {
  await loadProgressPlans({ skill: 'speaking', to: '2026-11-17', status: 'all', offset: -5, limit: 1000 });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.getAll('payload->>dateKey')).toEqual(['lte.2026-11-17']);
  expect(url.searchParams.has('payload->>status')).toBe(false);
  expect(url.searchParams.get('or')).toBe('(payload->>skill.eq.speaking,and(payload->>skill.is.null,payload->>kind.in.(speaking-p1,speaking-p2,speaking-p3,stories,speaking-mock)),payload->>kind.in.(review,vocabulary,lexicon))');
  expect(url.searchParams.get('offset')).toBe('0');
  expect(url.searchParams.get('limit')).toBe('100');
});

test('rejects a response from the previous account after an account switch', async () => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const reading = loadProgressPlans({ skill: 'writing', to: '2026-11-17' });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  beginAccountLoad(); setAccountIdentity('00000000-0000-4000-8000-000000000002');
  const rejected = expect(reading).rejects.toThrow('Account load superseded');
  finish(new Response(JSON.stringify([row]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }));
  await rejected;
});

test('pending status includes legacy defaults and keeps skill filtering in the same expression', async () => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify([{ ...row, status: null }]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }));
  const result = await loadProgressPlans({ skill: 'vocabulary', to: '2026-11-17', status: 'pending' });
  expect(result.plans[0].status).toBe('pending');
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.getAll('or')).toEqual(['(and(or(payload->>skill.eq.vocabulary,and(payload->>skill.is.null,payload->>kind.in.(vocabulary,lexicon))),or(payload->>status.eq.pending,payload->>status.is.null)))']);
  expect(url.searchParams.has('payload->>status')).toBe(false);
});

test('missing counts and malformed rows remain read errors', async () => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify([row]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expect(loadProgressPlans({ skill: 'writing', to: '2026-11-17' })).rejects.toThrow('Study plans could not be read');
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify([{ ...row, status: 'unknown' }]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }));
  await expect(loadProgressPlans({ skill: 'writing', to: '2026-11-17' })).rejects.toThrow('Invalid study plan summary');
});

test('a rejected query never becomes an empty successful result', async () => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Read unavailable', code: 'XX000' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  await expect(loadProgressPlans({ skill: 'writing', to: '2026-11-17' })).rejects.toMatchObject({ message: 'Read unavailable' });
});

test('a successful out-of-range response retains the reduced total for page clamping', async () => {
  fetcher.mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/20' } }));
  await expect(loadProgressPlans({ skill: 'writing', to: '2026-11-17', offset: 20 })).resolves.toEqual({ plans: [], total: 20, offset: 20, limit: 20 });
});

test('a PostgREST 416 stays an actionable range error instead of empty history', async () => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PGRST103', details: 'An offset of 20 was requested, but there are only 20 rows.', message: 'Requested range not satisfiable' }), { status: 416, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/20' } }));
  await expect(loadProgressPlans({ skill: 'writing', to: '2026-11-17', offset: 20 })).rejects.toThrow('This study plan page is no longer available. Retry from the first page.');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
