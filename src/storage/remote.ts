// @ts-nocheck
import { emptyState, migrateState, persistShape, STATE_VERSION } from '../domain';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
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
let currentAccountId: string | null = null;
let hydrationGeneration = 0;
export function accountId() { return currentAccountId; }
export function resetAccountStore() { hydrationGeneration += 1; currentAccountId = null; snapshot = null; accountReady = false; }

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
    const { data, error } = await supabase.from(table).select('id, payload, updated_at').range(from, from + PAGE - 1);
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

export async function loadVocabularyCatalog(options: { bookId?: string; term?: string; limit?: number; offset?: number } = {}) {
  if (!supabaseConfigured()) throw new Error('Vocabulary catalog is unavailable offline.');
  const supabase = getSupabase();
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  async function page(table: string, filter?: (query) => unknown) {
    let query = supabase.from(table).select('id, payload').order('id', { ascending: true });
    if (filter) query = filter(query);
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(`Could not load vocabulary catalog (${table}): ${error.message || 'request failed'}`);
    return (data || []).map(row => Object.assign({}, row.payload, { id: String(row.id) }));
  }
  if (options.term?.trim()) {
    const term = options.term.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
    const entries = await page('word_entries', query => query.eq('payload->>term', term));
    return { entries, books: [], units: [], memberships: [], nextOffset: entries.length === limit ? offset + limit : null };
  }
  if (options.bookId) {
    const bookId = String(options.bookId);
    const [books, units, memberships] = await Promise.all([
      page('wordbooks', query => query.eq('id', bookId)),
      page('wordbook_units', query => query.eq('payload->>bookId', bookId)),
      page('wordbook_memberships', query => query.eq('payload->>bookId', bookId)),
    ]);
    const ids = [...new Set(memberships.map(row => row.entryId).filter(Boolean))];
    // The membership page bounds the entry fetch; the whole public catalogue is never loaded.
    const entries = ids.length ? (await Promise.all(Array.from({length:Math.ceil(ids.length/80)},async(_,index)=>{
      const chunk=ids.slice(index*80,index*80+80);
      const { data, error } = await supabase.from('word_entries').select('id, payload').in('id', chunk).order('id', { ascending: true }).range(0, chunk.length - 1);
      if (error) throw new Error(`Could not load vocabulary catalog (word_entries): ${error.message || 'request failed'}`);
      return (data || []).map(row => Object.assign({}, row.payload, { id: String(row.id) }));
    }))).flat() : [];
    return { entries, books, units: units.map(unit => ({ ...unit, id: unit.sourceUnitId || unit.id })), memberships, nextOffset: memberships.length === limit ? offset + limit : null };
  }
  const books = await page('wordbooks');
  return { entries: [], books, units: [], memberships: [], nextOffset: books.length === limit ? offset + limit : null };
}

export async function hydrateState() {
  const generation = ++hydrationGeneration;
  if (!supabaseConfigured()) {
    currentAccountId = null;
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (generation !== hydrationGeneration) throw new Error('Account load superseded');
  currentAccountId = session?.user.id || null;
  if (!session) {
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const [profileResult, writing, topics, samples, legacyLexicon, ...lists] = await Promise.all([
    supabase.from('profiles').select('settings, active_plan_id, reviewed_at').eq('id', session.user.id).maybeSingle(),
    selectCatalog('writing_questions'),
    selectCatalog('speaking_topics'),
    selectCatalog('speaking_samples'),
    selectAll('lexicon'),
    ...USER_LISTS.map((key) => selectAll(USER_TABLES[key])),
  ]);
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  const samplesById = {};
  samples.forEach((row) => {
    samplesById[String(row.id)] = row.payload || {};
  });
  const raw = {
    schemaVersion: STATE_VERSION,
    questions: writing.map((row) => Object.assign({}, row.payload, { id: String(row.id) })),
    speakingTopics: topics.map((row) =>
      Object.assign({}, row.payload, samplesById[String(row.id)] || {}, { id: String(row.id) }),
    ),
    settings: (profile && profile.settings) || {},
    activePlanId: profile ? profile.active_plan_id : null,
    reviewedAt: profile ? profile.reviewed_at : null,
    drafts: {},
    lexicon: rowsToList(legacyLexicon),
  };
  USER_LISTS.forEach((key, index) => {
    raw[key] = rowsToList(lists[index]);
  });
  raw.drafts = rowsToDrafts(await selectAll('drafts'));
  const state = migrateState(raw);
  if (generation !== hydrationGeneration || currentAccountId !== session.user.id) throw new Error('Account load superseded');
  snapshot = takeSnapshot({ ...state, ...Object.fromEntries(VOCABULARY_LISTS.map(key=>[key,raw[key]||[]])) });
  accountReady = true;
  return state;
}

async function pushDiff(table: string, userId: string, diff: { upserts: { id: string; payload: unknown }[]; deletes: string[] }, now: string) {
  if (!diff.upserts.length && !diff.deletes.length) return;
  const supabase = getSupabase();
  if (diff.upserts.length) {
    const { error } = await supabase.from(table).upsert(
      diff.upserts.map((row) => ({
        user_id: userId,
        id: row.id,
        payload: row.payload,
        updated_at: now,
      })),
      { onConflict: 'user_id,id' },
    );
    if (error) throw error;
  }
  if (diff.deletes.length) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', diff.deletes);
    if (error) throw error;
  }
}

export async function saveState(state, onQuotaToast?: (message: string) => void) {
  const expectedAccount = currentAccountId;
  if (!supabaseConfigured()) {
    if (onQuotaToast) onQuotaToast('Add Supabase keys before study records can be saved.');
    return false;
  }
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session || (expectedAccount && session.user.id !== expectedAccount)) {
    if (onQuotaToast) onQuotaToast('Sign in to save.');
    return false;
  }
  const next = takeSnapshot(state);
  const previous = snapshot || emptySnapshot();
  const now = new Date().toISOString();
  try {
    for (const key of USER_LISTS) {
      if (currentAccountId !== expectedAccount) return false;
      await pushDiff(USER_TABLES[key], session.user.id, diffList(previous.lists[key], next.lists[key]), now);
    }
    if (currentAccountId !== expectedAccount) return false;
    await pushDiff('drafts', session.user.id, diffDrafts(previous.drafts, next.drafts), now);
    if (previous.profile !== next.profile) {
      const shaped = persistShape(state);
      const { error } = await supabase
        .from('profiles')
        .update({
          settings: shaped.settings || {},
          active_plan_id: shaped.activePlanId || null,
          reviewed_at: shaped.reviewedAt || null,
          updated_at: now,
        })
        .eq('id', session.user.id);
      if (error) throw error;
    }
    if (currentAccountId !== expectedAccount) return false;
    snapshot = next;
    accountReady = true;
    return true;
  } catch {
    if (onQuotaToast) onQuotaToast('Could not save to your account. Try again.');
    return false;
  }
}

export async function saveVocabularyImport(state, batchId: string, onError?: (message: string) => void) {
  const expectedAccount = currentAccountId;
  const generation = hydrationGeneration;
  if (!supabaseConfigured() || !expectedAccount || !accountReady) {
    onError?.('Sign in to import vocabulary.');
    return false;
  }
  const supabase = getSupabase();
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session || data.session.user.id !== expectedAccount || currentAccountId !== expectedAccount || generation !== hydrationGeneration) return false;
    const next = takeSnapshot(state);
    const previous = snapshot || emptySnapshot();
    const importBatch = next.lists.vocabularyImportBatches.find(row => row.id === batchId);
    if (!batchId || !importBatch) throw new Error('Missing import batch');
    const lists = Object.fromEntries(VOCABULARY_IMPORT_LISTS.map(key => [key, diffList(previous.lists[key], next.lists[key]).upserts]));
    const { data: commitResult, error } = await supabase.rpc('commit_vocabulary_import', {
      batch: { id: batchId, lists, importBatch, updatedAt: new Date().toISOString() },
    });
    if (error) throw error;
    if (currentAccountId !== expectedAccount || generation !== hydrationGeneration) return false;
    // A replay acknowledges the earlier transaction, not edits added since it.
    if (commitResult?.alreadyCommitted) return true;
    // Other edits in this state have not been saved by the vocabulary transaction.
    const updated = snapshot || emptySnapshot();
    VOCABULARY_IMPORT_LISTS.forEach(key => { updated.lists[key] = next.lists[key]; });
    snapshot = updated;
    return true;
  } catch {
    onError?.('Could not import vocabulary to your account. Try again.');
    return false;
  }
}

export async function saveVocabularySession(state, sessionId: string, onError?: (message: string) => void) {
  const expectedAccount = currentAccountId;
  const generation = hydrationGeneration;
  if (!supabaseConfigured() || !expectedAccount || !accountReady) {
    onError?.('Sign in to save vocabulary practice.');
    return false;
  }
  const supabase = getSupabase();
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session || data.session.user.id !== expectedAccount || currentAccountId !== expectedAccount || generation !== hydrationGeneration) return false;
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
    const { data: commitResult, error } = await supabase.rpc('commit_vocabulary_session', {
      batch: { id: sessionId, session: completedSession, lists, updatedAt: new Date().toISOString() },
    });
    if (error) throw error;
    if (currentAccountId !== expectedAccount || generation !== hydrationGeneration) return false;
    if (commitResult?.id !== sessionId || typeof commitResult.alreadyCommitted !== 'boolean') throw new Error('Invalid vocabulary session acknowledgement');
    // A replay confirms the earlier transaction, not the new diff supplied now.
    if (commitResult.alreadyCommitted) return true;
    const updated = snapshot || emptySnapshot();
    VOCABULARY_SESSION_LISTS.forEach(key => {
      const rows = new Map((updated.lists[key] || []).map(row => [row.id, row]));
      lists[key].forEach(row => { rows.set(row.id, row.payload); });
      if (key === 'vocabularySessions') rows.set(sessionId, completedSession);
      updated.lists[key] = Array.from(rows.values());
    });
    snapshot = updated;
    return true;
  } catch {
    onError?.('Could not save vocabulary practice to your account. Try again.');
    return false;
  }
}
