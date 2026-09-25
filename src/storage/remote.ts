// @ts-nocheck
import { emptyState, migrateState, persistShape } from '../domain';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { USER_LISTS, diffDrafts, diffList, profileStamp, rowsToDrafts, rowsToList, type UserListKey } from './sync';

const PAGE = 1000;

type Snapshot = {
  lists: Record<UserListKey, unknown[]>;
  drafts: Record<string, unknown>;
  profile: string;
};

let snapshot: Snapshot | null = null;
let accountReady = false;

export function accountStoreAvailable() {
  return accountReady;
}

function emptySnapshot(): Snapshot {
  return {
    lists: {
      sessions: [],
      assessments: [],
      lexicon: [],
      errors: [],
      plans: [],
      stories: [],
    },
    drafts: {},
    profile: profileStamp({}),
  };
}

function takeSnapshot(state): Snapshot {
  const shaped = persistShape(state);
  return {
    lists: {
      sessions: shaped.sessions || [],
      assessments: shaped.assessments || [],
      lexicon: shaped.lexicon || [],
      errors: shaped.errors || [],
      plans: shaped.plans || [],
      stories: shaped.stories || [],
    },
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

export async function hydrateState() {
  if (!supabaseConfigured()) {
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) {
    accountReady = false;
    snapshot = emptySnapshot();
    return emptyState();
  }
  const [profileResult, writing, topics, samples, ...lists] = await Promise.all([
    supabase.from('profiles').select('settings, active_plan_id, reviewed_at').eq('id', session.user.id).maybeSingle(),
    selectCatalog('writing_questions'),
    selectCatalog('speaking_topics'),
    selectCatalog('speaking_samples'),
    ...USER_LISTS.map((table) => selectAll(table)),
  ]);
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  const samplesById = {};
  samples.forEach((row) => {
    samplesById[String(row.id)] = row.payload || {};
  });
  const raw = {
    schemaVersion: 8,
    questions: writing.map((row) => Object.assign({}, row.payload, { id: String(row.id) })),
    speakingTopics: topics.map((row) =>
      Object.assign({}, row.payload, samplesById[String(row.id)] || {}, { id: String(row.id) }),
    ),
    settings: (profile && profile.settings) || {},
    activePlanId: profile ? profile.active_plan_id : null,
    reviewedAt: profile ? profile.reviewed_at : null,
    drafts: {},
  };
  USER_LISTS.forEach((key, index) => {
    raw[key] = rowsToList(lists[index]);
  });
  raw.drafts = rowsToDrafts(await selectAll('drafts'));
  const state = migrateState(raw);
  snapshot = takeSnapshot(state);
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
  if (!supabaseConfigured()) {
    if (onQuotaToast) onQuotaToast('Add Supabase keys before study records can be saved.');
    return false;
  }
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    if (onQuotaToast) onQuotaToast('Sign in to save.');
    return false;
  }
  const next = takeSnapshot(state);
  const previous = snapshot || emptySnapshot();
  const now = new Date().toISOString();
  try {
    for (const key of USER_LISTS) {
      await pushDiff(key, session.user.id, diffList(previous.lists[key], next.lists[key]), now);
    }
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
    snapshot = next;
    accountReady = true;
    return true;
  } catch {
    if (onQuotaToast) onQuotaToast('Could not save to your account. Try again.');
    return false;
  }
}
