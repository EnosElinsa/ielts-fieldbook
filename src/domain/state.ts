// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeStory, dedupeStories } from './stories';
import { dedupeLexicon } from './lexicon';
import { wordCount, hashText, dateKey, makeId, nowIso, clone } from './utils';

export const STATE_VERSION = 7;
export const BANK_CACHE_KEY = 'ielts-fieldbook-bank-cache';
export const LEGACY_STORES = ['ielts-writing-fieldbook-v3', 'ielts-writing-fieldbook-v2', 'ielts-writing-fieldbook-v1'];
export const DEFAULT_SETTINGS = {
  examDate: '',
  dailyMinutes: 30,
  days: [1, 2, 3, 4, 5, 6],
  focus: 'balanced',
  targetBand: '',
  activeSkill: 'writing',
  skillMix: 'mixed',
  speakingFocus: 'balanced',
};

export function normalizeDraft(raw) {
  if (raw == null || typeof raw === 'boolean') {
    return { text: raw == null ? '' : String(raw), transcript: '', notes: '', parentSessionId: null };
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { text: String(raw), transcript: '', notes: '', parentSessionId: null };
  }
  const source = typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    text: String(source.text || ''),
    transcript: String(source.transcript || ''),
    notes: String(source.notes || ''),
    parentSessionId: source.parentSessionId || null,
  };
}

export function draftText(draft, skill) {
  const normalized = normalizeDraft(draft);
  if (skill === 'speaking') return normalized.transcript || normalized.text;
  return normalized.text;
}

export function migrateDrafts(source) {
  const incoming = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const drafts = {};
  Object.keys(incoming).forEach(key => {
    if (key.endsWith(':notes')) return;
    drafts[key] = normalizeDraft(incoming[key]);
  });
  Object.keys(incoming).forEach(key => {
    if (!key.endsWith(':notes')) return;
    const id = key.slice(0, -6);
    const current = drafts[id] || normalizeDraft(null);
    const extra = incoming[key];
    const notes = typeof extra === 'string' ? extra : normalizeDraft(extra).notes;
    drafts[id] = Object.assign({}, current, { notes: current.notes || String(notes || '') });
  });
  return drafts;
}

export function assessmentHasStructure(item) {
  return Boolean(item && item.overall && item.summary && Array.isArray(item.criteria) && item.criteria.length);
}

export function persistShape(state) {
  const payload = Object.assign({}, state, { schemaVersion: STATE_VERSION });
  delete payload.questions;
  delete payload.speakingTopics;
  payload.assessments = (state.assessments || []).map(item => {
    if (!assessmentHasStructure(item)) return item;
    const copy = Object.assign({}, item);
    delete copy.rawText;
    return copy;
  });
  return payload;
}

export function compactAssessmentsForQuota(state) {
  const withRaw = (state.assessments || []).filter(item => item && item.rawText).slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
  if (!withRaw.length) return { stripped: 0 };
  delete withRaw[0].rawText;
  return { stripped: 1 };
}

export function slimSpeakingTopic(topic) {
  const source = topic || {};
  return {
    id: source.id,
    part: source.part,
    title: source.title,
    titleZh: source.titleZh,
    questions: source.questions,
    cueCard: source.cueCard,
    bullets: source.bullets,
    part3: source.part3,
    incomplete: source.incomplete,
  };
}

export function bankCacheShape(input) {
  const source = input || {};
  return {
    writing: Array.isArray(source.writing) ? source.writing : [],
    speakingTopicsSlim: (source.speakingTopics || []).map(slimSpeakingTopic),
    cachedAt: source.cachedAt || nowIso(),
  };
}

export function clearLegacyStores(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  LEGACY_STORES.forEach(key => storage.removeItem(key));
}

export function emptyState() {
  return {
    schemaVersion: STATE_VERSION,
    questions: [],
    sessions: [],
    drafts: {},
    errors: [],
    assessments: [],
    lexicon: [],
    plans: [],
    stories: [],
    speakingTopics: [],
    settings: clone(DEFAULT_SETTINGS),
    activePlanId: null,
    reviewedAt: null,
  };
}

export function migrateState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const state = Object.assign(emptyState(), source);
  state.schemaVersion = STATE_VERSION;
  state.questions = Array.isArray(source.questions) ? source.questions.map(q => Object.assign({}, q, { id: String(q.id) })) : [];
  state.sessions = Array.isArray(source.sessions) ? source.sessions.map((item, index) => {
    const session = Object.assign({}, item);
    session.id = session.id || `legacy-session-${index}`;
    session.questionId = String(session.questionId ?? session.question_id ?? '');
    session.essay = String(session.essay ?? session.candidateResponse ?? '');
    session.date = session.date || nowIso();
    session.planDate = session.planDate || dateKey(session.date);
    session.words = Number(session.words) || wordCount(session.essay);
    session.attemptKind = session.attemptKind || (session.parentSessionId ? 'rewrite' : 'original');
    session.parentSessionId = session.parentSessionId || null;
    session.assessmentId = session.assessmentId || null;
    session.skill = session.skill === 'speaking' ? 'speaking' : 'writing';
    if (session.skill === 'speaking') {
      const part = String(session.part ?? '');
      session.part = ['1', '2', '3'].includes(part) ? part : '';
      session.notes = String(session.notes ?? '');
    }
    return session;
  }) : [];
  state.assessments = Array.isArray(source.assessments) ? source.assessments.map((item, index) => Object.assign({
    id: `legacy-assessment-${index}`,
    date: nowIso(),
    filename: 'Score',
    sessionId: null,
    questionId: '',
    overall: '',
    criteria: [],
    rawText: item && item.text ? item.text : '',
    missingEssay: false,
  }, item, { rawText: item && (item.rawText || item.text) || '' })).map(item => Object.assign(item, { contentHash: item.contentHash || hashText(item.rawText || '') })) : [];
  const assessmentsByContent = new Map();
  state.assessments.forEach(assessment => {
    const key = assessment.contentHash || assessment.id;
    const existing = assessmentsByContent.get(key);
    if (!existing || (!existing.sessionId && assessment.sessionId) || Boolean(existing.sessionId) === Boolean(assessment.sessionId)) assessmentsByContent.set(key, assessment);
  });
  state.assessments = Array.from(assessmentsByContent.values());
  state.lexicon = Array.isArray(source.lexicon) ? source.lexicon.map((item, index) => {
    const entry = Object.assign({
      id: `legacy-lexicon-${index}`,
      category: 'word',
      term: '',
      meaning: '',
      example: '',
      tags: [],
      source: '',
      status: 'new',
      reviewCount: 0,
      successStreak: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }, item || {});
    entry.id = entry.id || `legacy-lexicon-${index}`;
    entry.category = ['word', 'phrase', 'sentence'].includes(entry.category) ? entry.category : 'word';
    entry.term = String(entry.term || '').trim();
    entry.meaning = String(entry.meaning || '').trim();
    entry.example = String(entry.example || '').trim();
    entry.tags = Array.isArray(entry.tags) ? entry.tags.map(value => String(value).trim()).filter(Boolean) : String(entry.tags || '').split(/[;,；，]/).map(value => value.trim()).filter(Boolean);
    entry.reviewCount = Number(entry.reviewCount) || 0;
    entry.successStreak = Number(entry.successStreak) || (entry.status === 'mastered' ? 5 : 0);
    entry.status = ['new', 'learning', 'mastered'].includes(entry.status) ? entry.status : 'new';
    entry.skill = entry.skill === 'speaking' ? 'speaking' : 'writing';
    return entry;
  }) : [];
  state.lexicon = dedupeLexicon(state.lexicon);
  state.errors = Array.isArray(source.errors) ? source.errors.map((item, index) => {
    const error = Object.assign({
      id: `legacy-error-${index}`,
      code: 'REVIEW',
      text: '',
      sourceSessionId: null,
      sourceAssessmentId: null,
      reviewCount: 0,
      lastReviewedAt: null,
      resolved: false,
    }, item);
    if (!error.nextReviewAt) error.nextReviewAt = error.resolved ? (error.lastReviewedAt || null) : nowIso();
    return error;
  }) : [];
  state.plans = Array.isArray(source.plans) ? source.plans.map((item, index) => Object.assign({
    id: `legacy-plan-${index}`,
    status: 'pending',
    linkedSessionId: null,
    startedAt: null,
    completedAt: null,
    driver: null,
  }, item)) : [];
  state.drafts = migrateDrafts(source.drafts);
  state.stories = dedupeStories(Array.isArray(source.stories) ? source.stories.map(normalizeStory) : []);
  state.speakingTopics = Array.isArray(source.speakingTopics) ? source.speakingTopics.map(item => Object.assign({}, item)) : [];
  state.settings = Object.assign({}, DEFAULT_SETTINGS, source.settings || {});
  state.settings.days = Array.isArray(state.settings.days) && state.settings.days.length ? state.settings.days.map(Number) : clone(DEFAULT_SETTINGS.days);
  if (!['writing', 'speaking'].includes(state.settings.activeSkill)) state.settings.activeSkill = 'writing';
  if (!['writing', 'speaking', 'mixed'].includes(state.settings.skillMix)) state.settings.skillMix = 'mixed';
  if (!['balanced', 'part1', 'part2'].includes(state.settings.speakingFocus)) state.settings.speakingFocus = 'balanced';
  return state;
}

export function createAttempt(state, input, deps) {
  const services = Object.assign({ id: () => makeId('session'), now: nowIso }, deps || {});
  const attempt = {
    id: services.id(),
    date: services.now(),
    planDate: input.planDate || dateKey(services.now()),
    questionId: String(input.questionId),
    name: input.name || `Question ${input.questionId}`,
    type: String(input.type || '1'),
    words: wordCount(input.essay),
    essay: String(input.essay || ''),
    focus: input.focus || '',
    next: input.next || '',
    attemptKind: input.parentSessionId ? 'rewrite' : (input.attemptKind || 'original'),
    parentSessionId: input.parentSessionId || null,
    assessmentId: null,
    planId: input.planId || null,
    skill: input.skill === 'speaking' ? 'speaking' : 'writing',
    part: ['1', '2', '3'].includes(String(input.part ?? '')) ? String(input.part) : '',
    notes: String(input.notes ?? ''),
  };
  state.sessions.push(attempt);
  return attempt;
}
