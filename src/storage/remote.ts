// @ts-nocheck
import { emptyState, migrateState, persistShape, STATE_VERSION } from '../domain';
import { normalizeVocabularyIdentities, normalizeVocabularyScope } from '../domain/vocabulary/identities';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { cachedRead, clearReadCache, readCacheKey, readSnapshot, subscribeRead } from '../lib/readCache';
import { accountId, accountGeneration, beginAccountLoad, resetAccountIdentity, setAccountIdentity } from './accountIdentity';
import { ACCOUNT_MODULES, emptyCollectionStatuses, type AccountCollection, type AccountModule } from './accountModules';
export { accountId } from './accountIdentity';
export type { AccountCollection, AccountModule, CollectionStatus, CollectionStatuses } from './accountModules';
import { USER_LISTS, USER_TABLES, VOCABULARY_LISTS, diffDrafts, diffList, profileStamp, rowsToDrafts, rowsToList, type UserListKey } from './sync';

const PAGE = 1000;
const VOCABULARY_IMPORT_LISTS = VOCABULARY_LISTS.filter(key => key !== 'vocabularySessions');
const VOCABULARY_SESSION_LISTS = VOCABULARY_LISTS.filter(key => key !== 'vocabularyImportBatches');

type Snapshot = {
  lists: Record<UserListKey, unknown[]>;
  drafts: Record<string, unknown>;
  profile: string;
};

let snapshot: Snapshot | null = null;
let accountReady = false;
let statuses = emptyCollectionStatuses();
let accountState = emptyState();
const moduleLoads = new Map<AccountModule, Promise<unknown>>();
const moduleRows = new Map<AccountModule, { generation: number; owner: string | null; promise: Promise<unknown> }>();
let pendingCommit: { stamp: string; batch: unknown } | null = null;
export function getCollectionStatuses() { return { ...statuses }; }
export function resetAccountStore() {
  resetAccountIdentity(); snapshot = null; accountReady = false; statuses = emptyCollectionStatuses();
  accountState = emptyState(); moduleLoads.clear(); moduleRows.clear(); pendingCommit = null;
  clearReadCache();
}

function assertAccount(generation: number, id: string | null) {
  if (generation !== accountGeneration() || id !== accountId()) throw new Error('Account load superseded');
}

function accountRpc(supabase, name: string, args, session) {
  const request = supabase.rpc(name, args);
  // Pin the verified session across an auth switch while the request starts.
  return session.access_token && typeof request.setHeader === 'function'
    ? request.setHeader('Authorization', `Bearer ${session.access_token}`)
    : request;
}

export function accountStoreAvailable() {
  return accountReady;
}

function emptySnapshot(): Snapshot {
  return {
    lists: Object.fromEntries(USER_LISTS.map(key => [key, []])),
    drafts: {},
    profile: profileStamp({}),
  };
}

function takeSnapshot(state): Snapshot {
  const shaped = structuredClone(persistShape(state));
  return {
    lists: Object.fromEntries(USER_LISTS.map(key => [key, shaped[key] || []])),
    drafts: shaped.drafts || {},
    profile: profileStamp(shaped),
  };
}

async function selectAll(table: string) {
  const supabase = getSupabase();
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('id, payload, updated_at').order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function selectCatalog(table: string) {
  const supabase = getSupabase();
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('id, payload').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadVocabularyCatalog(options: { bookId?: string; unitId?: string; entryIds?: string[]; term?: string; limit?: number; offset?: number } = {}) {
  options = normalizeVocabularyScope(options);
  if (!supabaseConfigured()) throw new Error('Vocabulary catalog is unavailable offline.');
  const supabase = getSupabase();
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  async function page(table: string, filter?: (query) => unknown) {
    let query = supabase.from(table).select('id, payload').order('id', { ascending: true });
    if (filter) query = filter(query);
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(`Could not load vocabulary catalog (${table}): ${error.message || 'request failed'}`);
    return (data || []).map(row => normalizeVocabularyIdentities(Object.assign({}, row.payload, { id: String(row.id) })));
  }
  if (options.term?.trim()) {
    const term = options.term.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
    const entries = await page('word_entries', query => query.eq('payload->>term', term));
    return { entries, books: [], units: [], memberships: [], nextOffset: entries.length === limit ? offset + limit : null };
  }
  if (options.entryIds?.length) {
    const ids = [...new Set(options.entryIds.map(String))];
    const entries = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 80) }, async (_, index) => {
      const chunk = ids.slice(index * 80, index * 80 + 80);
      const { data, error } = await supabase.from('word_entries').select('id, payload').in('id', chunk).range(0, chunk.length - 1);
      if (error) throw error;
      return (data || []).map(row => ({ ...row.payload, id: String(row.id) }));
    }))).flat();
    return { entries, books: [], units: [], memberships: [], nextOffset: null };
  }
  if (options.bookId) {
    const bookId = String(options.bookId);
    const [books, units, memberships] = await Promise.all([
      page('wordbooks', query => query.eq('id', bookId)),
      page('wordbook_units', query => query.eq('payload->>bookId', bookId)),
      page('wordbook_memberships', query => {
        const scoped = query.eq('payload->>bookId', bookId);
        return options.unitId ? scoped.eq('payload->>unitId', String(options.unitId)) : scoped;
      }),
    ]);
    const ids = [...new Set(memberships.map(row => row.entryId).filter(Boolean))];
    // The membership page bounds the entry fetch; the whole public catalogue is never loaded.
    const entries = ids.length ? (await Promise.all(Array.from({length:Math.ceil(ids.length/80)},async(_,index)=>{
      const chunk=ids.slice(index*80,index*80+80);
      const { data, error } = await supabase.from('word_entries').select('id, payload').in('id', chunk).order('id', { ascending: true }).range(0, chunk.length - 1);
      if (error) throw new Error(`Could not load vocabulary catalog (word_entries): ${error.message || 'request failed'}`);
      return (data || []).map(row => Object.assign({}, row.payload, { id: String(row.id) }));
    }))).flat() : [];
    return { entries, books, units, memberships, nextOffset: memberships.length === limit ? offset + limit : null };
  }
  const books = await page('wordbooks');
  return { entries: [], books, units: [], memberships: [], nextOffset: books.length === limit ? offset + limit : null };
}

export type QuestionBankRow = { id: string; [key: string]: unknown };
export type QuestionBankSnapshot = { rows?: QuestionBankRow[]; error?: unknown; loading: boolean };
const questionBankTable = (skill: 'writing' | 'speaking') => skill === 'writing' ? 'writing_questions' : 'speaking_topics';
const questionBankKey = (skill: 'writing' | 'speaking') => readCacheKey(accountId(), String(STATE_VERSION), questionBankTable(skill), accountGeneration());

/** Subscribe before reading to receive cached rows and subsequent background updates. */
export function subscribeQuestionBank(skill: 'writing' | 'speaking', listener: (snapshot: QuestionBankSnapshot) => void): () => void {
  const generation = accountGeneration();
  const id = accountId();
  const key = questionBankKey(skill);
  const publish = () => {
    if (generation !== accountGeneration() || id !== accountId()) return;
    const { data, error, loading } = readSnapshot<QuestionBankRow[]>(key);
    listener({ rows: data === undefined ? undefined : structuredClone(data), error, loading });
  };
  const unsubscribe = subscribeRead(key, publish);
  publish();
  return unsubscribe;
}

export async function ensureQuestionBank(skill: 'writing' | 'speaking', options: { force?: boolean } = {}) {
  const generation = accountGeneration();
  const id = accountId();
  const table = questionBankTable(skill);
  const data = await cachedRead(questionBankKey(skill), async () =>
    (await selectCatalog(table)).map(row => ({ ...row.payload, id: String(row.id) })), options);
  assertAccount(generation, id);
  return structuredClone(data);
}

export async function ensureSpeakingSample(topicId: string) {
  const generation = accountGeneration();
  const id = accountId();
  const sample = await cachedRead(readCacheKey(id, String(STATE_VERSION), 'speaking_samples', [generation, topicId]), async () => {
    const { data, error } = await getSupabase().from('speaking_samples').select('id, payload').eq('id', topicId).maybeSingle();
    if (error) throw error;
    return data ? { ...data.payload, id: String(data.id) } : null;
  }, { staleWhileRevalidate: false });
  assertAccount(generation, id);
  return sample;
}

function readAccountModuleRows(module: AccountModule, generation: number, owner: string | null) {
  const existing = moduleRows.get(module);
  if (existing?.generation === generation && existing.owner === owner) return existing.promise;
  const keys = ACCOUNT_MODULES[module];
  if (!keys) throw new Error('Unknown account module');
  const collections = module === 'vocabulary' ? [...keys, 'lexicon'] : keys;
  const promise = Promise.all(collections.map(key => selectAll(key === 'lexicon' ? 'lexicon' : USER_TABLES[key])))
    .then(rows => { assertAccount(generation, owner); return rows; });
  const pending = { generation, owner, promise };
  moduleRows.set(module, pending);
  // Prefetch failure must not reject an otherwise usable base workspace.
  void promise.catch(() => { if (moduleRows.get(module) === pending) moduleRows.delete(module); });
  return promise;
}

export async function ensureAccountModule(module: AccountModule) {
  const keys = ACCOUNT_MODULES[module];
  if (!keys) throw new Error('Unknown account module');
  if (!accountReady || !accountId()) throw new Error('Sign in to load account records.');
  const result = () => ({ data: Object.fromEntries(keys.map(key => [key, structuredClone(accountState[key] || [])])), statuses: getCollectionStatuses() });
  if (keys.every(key => statuses[key] === 'ready')) return result();
  if (moduleLoads.has(module)) return moduleLoads.get(module);
  const generation = accountGeneration();
  const id = accountId();
  const collections = module === 'vocabulary' ? [...keys, 'lexicon'] : keys;
  collections.forEach(key => { statuses[key] = 'loading'; });
  const promise = (async () => {
    try {
      const rows = await readAccountModuleRows(module, generation, id);
      assertAccount(generation, id);
      const raw = Object.fromEntries(collections.map((key, index) => [key, rowsToList(rows[index])]));
      const normalized = migrateState({ ...emptyState(), ...raw });
      keys.forEach(key => {
        accountState[key] = normalized[key] || [];
        // Preserve raw vocabulary baselines so legacy migrations are persisted.
        snapshot.lists[key] = structuredClone(module === 'vocabulary' ? raw[key] || [] : normalized[key] || []);
      });
      collections.forEach(key => { statuses[key] = 'ready'; });
      return result();
    } catch (error) {
      if (generation === accountGeneration() && id === accountId()) collections.forEach(key => { statuses[key] = 'error'; });
      throw error;
    } finally {
      if (generation === accountGeneration() && id === accountId()) moduleLoads.delete(module);
    }
  })();
  moduleLoads.set(module, promise);
  return promise;
}

export async function ensureCompleteAccount() {
  const generation = accountGeneration();
  const id = accountId();
  await Promise.all(Object.keys(ACCOUNT_MODULES).map(module => ensureAccountModule(module as AccountModule)));
  assertAccount(generation, id);
  return structuredClone(accountState);
}

export async function hydrateState(options?: { modules?: AccountModule[]; prefetchModules?: AccountModule[]; prefetchBanks?: ('writing' | 'speaking')[] }) {
  const generation = beginAccountLoad();
  clearReadCache();
  accountState = emptyState();
  statuses = emptyCollectionStatuses(); moduleLoads.clear(); moduleRows.clear(); pendingCommit = null; snapshot = null; accountReady = false;
  if (!supabaseConfigured()) {
    setAccountIdentity(null);
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (generation !== accountGeneration()) throw new Error('Account load superseded');
  setAccountIdentity(session?.user.id || null);
  if (!session) {
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const base = Promise.all([
    supabase.from('profiles').select('settings, active_plan_id, reviewed_at').eq('id', session.user.id).maybeSingle(),
    selectAll('plans'), selectAll('drafts'),
  ]);
  for (const module of new Set(options?.prefetchModules || [])) readAccountModuleRows(module, generation, session.user.id);
  for (const skill of new Set(options?.prefetchBanks || [])) void ensureQuestionBank(skill).catch(() => {});
  const [profileResult, plans, drafts] = await base;
  assertAccount(generation, session.user.id);
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  const raw = {
    schemaVersion: STATE_VERSION,
    settings: (profile && profile.settings) || {},
    activePlanId: profile ? profile.active_plan_id : null,
    reviewedAt: profile ? profile.reviewed_at : null,
    drafts: rowsToDrafts(drafts),
    plans: rowsToList(plans),
  };
  const state = migrateState(raw);
  snapshot = takeSnapshot(state);
  accountState = state;
  statuses.profile = statuses.plans = statuses.drafts = 'ready';
  accountReady = true;
  await Promise.all((options?.modules || (options ? [] : Object.keys(ACCOUNT_MODULES))).map(module => ensureAccountModule(module as AccountModule)));
  if (!options) {
    const [writing, topics, samples] = await Promise.all([ensureQuestionBank('writing'), ensureQuestionBank('speaking'), selectCatalog('speaking_samples')]);
    assertAccount(generation, session.user.id);
    const samplesById = Object.fromEntries(samples.map(row => [String(row.id), row.payload || {}]));
    accountState.questions = writing;
    accountState.speakingTopics = topics.map(topic => ({ ...topic, ...samplesById[topic.id] }));
  }
  assertAccount(generation, session.user.id);
  return structuredClone(accountState);
}

export async function saveState(state, onQuotaToast?: (message: string) => void, options?: { collections?: AccountCollection[] }) {
  const expectedAccount = accountId();
  const generation = accountGeneration();
  const collections = new Set(options?.collections || Object.keys(statuses).filter(key => statuses[key] === 'ready'));
  if (!supabaseConfigured()) {
    if (onQuotaToast) onQuotaToast('Add Supabase keys before study records can be saved.');
    return false;
  }
  const supabase = getSupabase();
  try {
    if (!expectedAccount || !accountReady) throw new Error('Account is not loaded');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    assertAccount(generation, expectedAccount);
    if (sessionData.session?.user.id !== expectedAccount) throw new Error('Sign in to save');
    const next = takeSnapshot(state);
    const previous = snapshot || emptySnapshot();
    const changes = { lists: {} };
    for (const key of USER_LISTS) {
      if (!collections.has(key) || statuses[key] !== 'ready') continue;
      const diff = diffList(previous.lists[key], next.lists[key]);
      if (diff.upserts.length || diff.deletes.length) changes.lists[key] = diff;
    }
    if (collections.has('drafts') && statuses.drafts === 'ready') {
      const diff = diffDrafts(previous.drafts, next.drafts);
      if (diff.upserts.length || diff.deletes.length) changes.drafts = diff;
    }
    if (collections.has('profile') && statuses.profile === 'ready' && previous.profile !== next.profile) {
      const shaped = persistShape(state);
      changes.profile = { settings: shaped.settings || {}, activePlanId: shaped.activePlanId || null, reviewedAt: shaped.reviewedAt || null };
    }
    if (!Object.keys(changes.lists).length && !changes.drafts && !changes.profile) return true;
    const stamp = JSON.stringify(changes);
    const batch = pendingCommit?.stamp === stamp ? pendingCommit.batch : { id: crypto.randomUUID(), ...changes };
    pendingCommit = { stamp, batch };
    const { data: receipt, error } = await accountRpc(supabase, 'commit_workspace_changes', { batch }, sessionData.session);
    if (error) throw error;
    assertAccount(generation, expectedAccount);
    if (receipt?.id !== batch.id || typeof receipt.alreadyCommitted !== 'boolean') throw new Error('Invalid workspace acknowledgement');
    const updated = snapshot || emptySnapshot();
    for (const key of Object.keys(changes.lists)) {
      updated.lists[key] = next.lists[key];
      accountState[key] = structuredClone(next.lists[key]);
    }
    if (changes.drafts) { updated.drafts = next.drafts; accountState.drafts = structuredClone(next.drafts); }
    if (changes.profile) {
      updated.profile = next.profile;
      Object.assign(accountState, changes.profile);
    }
    snapshot = updated;
    pendingCommit = null;
    return true;
  } catch {
    if (onQuotaToast) onQuotaToast('Could not save to your account. Try again.');
    return false;
  }
}

export async function saveVocabularyImport(state, batchId: string, onError?: (message: string) => void) {
  const expectedAccount = accountId();
  const generation = accountGeneration();
  if (!supabaseConfigured() || !expectedAccount || !accountReady) {
    onError?.('Sign in to import vocabulary.');
    return false;
  }
  const supabase = getSupabase();
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session || data.session.user.id !== expectedAccount || accountId() !== expectedAccount || generation !== accountGeneration()) return false;
    if (!VOCABULARY_LISTS.every(key => statuses[key] === 'ready')) throw new Error('Vocabulary is not loaded');
    const next = takeSnapshot(state);
    const previous = snapshot || emptySnapshot();
    const importBatch = next.lists.vocabularyImportBatches.find(row => row.id === batchId);
    if (!batchId || !importBatch) throw new Error('Missing import batch');
    const lists = Object.fromEntries(VOCABULARY_IMPORT_LISTS.map(key => [key, diffList(previous.lists[key], next.lists[key]).upserts]));
    const { data: commitResult, error } = await accountRpc(supabase, 'commit_vocabulary_import', {
      batch: { id: batchId, lists, importBatch, updatedAt: new Date().toISOString() },
    }, data.session);
    if (error) throw error;
    if (accountId() !== expectedAccount || generation !== accountGeneration()) return false;
    // A replay acknowledges the earlier transaction, not edits added since it.
    if (commitResult?.alreadyCommitted) return true;
    // The import RPC acknowledges upserts only; deletions remain pending.
    const updated = snapshot || emptySnapshot();
    VOCABULARY_IMPORT_LISTS.forEach(key => {
      const rows = new Map((updated.lists[key] || []).map(row => [row.id, row]));
      lists[key].forEach(row => { rows.set(row.id, row.payload); });
      if (key === 'vocabularyImportBatches') rows.set(batchId, importBatch);
      updated.lists[key] = Array.from(rows.values());
      accountState[key] = structuredClone(updated.lists[key]);
    });
    snapshot = updated;
    return true;
  } catch {
    onError?.('Could not import vocabulary to your account. Try again.');
    return false;
  }
}

export async function saveVocabularySession(state, sessionId: string, onError?: (message: string) => void) {
  const expectedAccount = accountId();
  const generation = accountGeneration();
  if (!supabaseConfigured() || !expectedAccount || !accountReady) {
    onError?.('Sign in to save vocabulary practice.');
    return false;
  }
  const supabase = getSupabase();
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session || data.session.user.id !== expectedAccount || accountId() !== expectedAccount || generation !== accountGeneration()) return false;
    if (!VOCABULARY_LISTS.every(key => statuses[key] === 'ready')) throw new Error('Vocabulary is not loaded');
    const next = takeSnapshot(state);
    const previous = snapshot || emptySnapshot();
    const completedSession = next.lists.vocabularySessions.find(row => row.id === sessionId);
    if (!sessionId || !completedSession || completedSession.status !== 'submitted' || !completedSession.summary || typeof completedSession.summary !== 'object' || Array.isArray(completedSession.summary)) {
      throw new Error('Missing completed vocabulary session');
    }
    const lists = Object.fromEntries(VOCABULARY_SESSION_LISTS.map(key => [key, diffList(previous.lists[key], next.lists[key]).upserts]));
    // Only this session is acknowledged by the transaction's completion marker.
    lists.vocabularySessions = lists.vocabularySessions.filter(row => row.id === sessionId);
    // A replay can leave older immutable rows outside the local snapshot. They
    // belong to their own completion marker and must not enter this session RPC.
    for (const key of ['vocabularyReviews', 'vocabularyEvidence', 'vocabularyActivities']) {
      lists[key] = lists[key].filter(row => !row.payload.sessionId || row.payload.sessionId === sessionId);
    }
    const { data: commitResult, error } = await accountRpc(supabase, 'commit_vocabulary_session', {
      batch: { id: sessionId, session: completedSession, lists, updatedAt: new Date().toISOString() },
    }, data.session);
    if (error) throw error;
    if (accountId() !== expectedAccount || generation !== accountGeneration()) return false;
    if (commitResult?.id !== sessionId || typeof commitResult.alreadyCommitted !== 'boolean') throw new Error('Invalid vocabulary session acknowledgement');
    // A replay confirms the earlier transaction, not the new diff supplied now.
    if (commitResult.alreadyCommitted) return true;
    const updated = snapshot || emptySnapshot();
    VOCABULARY_SESSION_LISTS.forEach(key => {
      const rows = new Map((updated.lists[key] || []).map(row => [row.id, row]));
      lists[key].forEach(row => { rows.set(row.id, row.payload); });
      if (key === 'vocabularySessions') rows.set(sessionId, completedSession);
      updated.lists[key] = Array.from(rows.values());
      accountState[key] = structuredClone(updated.lists[key]);
    });
    snapshot = updated;
    return true;
  } catch {
    onError?.('Could not save vocabulary practice to your account. Try again.');
    return false;
  }
}
