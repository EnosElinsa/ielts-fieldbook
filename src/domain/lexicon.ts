// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { addLocalDays, makeId, nowIso } from './utils';

export function lexiconKey(term, skill, meaning) {
  return [
    String(term || '').trim().toLocaleLowerCase(),
    skill === 'speaking' ? 'speaking' : 'writing',
    String(meaning || '').trim().toLocaleLowerCase(),
  ].join('\u0000');
}

export function mergeLexiconFields(existing, entry) {
  if (!existing.meaning && entry.meaning) existing.meaning = entry.meaning;
  if (!existing.example && entry.example) existing.example = entry.example;
  if (!existing.source && entry.source) existing.source = entry.source;
  existing.tags = Array.from(new Set((existing.tags || []).concat(entry.tags || [])));
  if (Number(entry.reviewCount || 0) > Number(existing.reviewCount || 0)) {
    Object.assign(existing, {
      reviewCount: entry.reviewCount,
      successStreak: entry.successStreak,
      status: entry.status,
      lastReviewedAt: entry.lastReviewedAt,
      nextReviewAt: entry.nextReviewAt,
    });
  }
  return existing;
}

export function dedupeLexicon(entries) {
  const groups = new Map();
  (entries || []).forEach(entry => {
    if (!String(entry.term || '').trim()) return;
    const groupKey = lexiconKey(entry.term, entry.skill, '');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(entry);
  });
  const result = [];
  groups.forEach(group => {
    const byMeaning = new Map();
    const empties = [];
    group.forEach(entry => {
      const meaning = String(entry.meaning || '').trim().toLocaleLowerCase();
      if (!meaning) empties.push(entry);
      else {
        const existing = byMeaning.get(meaning);
        if (!existing) byMeaning.set(meaning, entry);
        else mergeLexiconFields(existing, entry);
      }
    });
    const withMeaning = Array.from(byMeaning.values());
    if (withMeaning.length) {
      empties.forEach(item => mergeLexiconFields(withMeaning[0], item));
      result.push(...withMeaning);
    } else if (empties.length) {
      const base = empties[0];
      empties.slice(1).forEach(item => mergeLexiconFields(base, item));
      result.push(base);
    }
  });
  return result;
}

export function addLexiconItem(state, input, deps) {
  const services = Object.assign({ id: () => makeId('lexicon'), now: nowIso }, deps || {});
  const payload = input || {};
  const term = String(payload.term || '').trim();
  if (!term) return { item: null, duplicate: false, invalid: true, reason: 'The phrase cannot be empty.' };
  const duplicate = state.lexicon.find(item => lexiconKey(item.term, item.skill, item.meaning) === lexiconKey(term, payload.skill, payload.meaning));
  if (duplicate) return { item: duplicate, duplicate: true };
  const timestamp = services.now();
  const item = {
    id: services.id(), category: ['word', 'phrase', 'sentence'].includes(payload.category) ? payload.category : 'word',
    term, meaning: String(payload.meaning || '').trim(), example: String(payload.example || '').trim(),
    tags: Array.isArray(payload.tags) ? payload.tags.map(value => String(value).trim()).filter(Boolean) : String(payload.tags || '').split(/[;,；，]/).map(value => value.trim()).filter(Boolean),
    source: String(payload.source || '').trim(), skill: payload.skill === 'speaking' ? 'speaking' : 'writing', status: 'new', reviewCount: 0, successStreak: 0,
    lastReviewedAt: null, nextReviewAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
  };
  state.lexicon.push(item);
  return { item, duplicate: false };
}

export function updateLexiconItem(state, itemId, changes, deps) {
  const item = state.lexicon.find(entry => entry.id === itemId);
  if (!item) return null;
  const payload = changes || {};
  if (payload.term !== undefined) {
    const nextTerm = String(payload.term || '').trim();
    const nextMeaning = payload.meaning !== undefined ? String(payload.meaning || '').trim() : item.meaning;
    const nextSkill = payload.skill !== undefined ? (payload.skill === 'speaking' ? 'speaking' : 'writing') : item.skill;
    const conflict = state.lexicon.find(entry => entry.id !== itemId && lexiconKey(entry.term, entry.skill, entry.meaning) === lexiconKey(nextTerm, nextSkill, nextMeaning));
    if (!nextTerm || conflict) return null;
    item.term = nextTerm;
  }
  if (payload.meaning !== undefined) item.meaning = String(payload.meaning || '').trim();
  if (payload.example !== undefined) item.example = String(payload.example || '').trim();
  if (payload.source !== undefined) item.source = String(payload.source || '').trim();
  if (payload.category !== undefined && ['word', 'phrase', 'sentence'].includes(payload.category)) item.category = payload.category;
  if (payload.skill !== undefined) item.skill = payload.skill === 'speaking' ? 'speaking' : 'writing';
  if (payload.tags !== undefined) item.tags = Array.isArray(payload.tags) ? payload.tags.map(value => String(value).trim()).filter(Boolean) : String(payload.tags || '').split(/[;,；，]/).map(value => value.trim()).filter(Boolean);
  item.updatedAt = (deps && deps.now ? deps.now : nowIso)();
  return item;
}

export function removeLexiconItem(state, itemId) {
  const index = state.lexicon.findIndex(item => item.id === itemId);
  if (index < 0) return false;
  state.lexicon.splice(index, 1);
  return true;
}

export function reviewLexiconItem(state, itemId, remembered, reviewedAt) {
  const item = state.lexicon.find(entry => entry.id === itemId);
  if (!item) return null;
  const grade = remembered === 'again' || remembered === false ? 'again' : remembered === 'easy' ? 'easy' : 'good';
  const at = new Date(reviewedAt || nowIso());
  item.reviewCount = Number(item.reviewCount || 0) + 1;
  item.lastReviewedAt = at.toISOString();
  const intervals = [1, 3, 7, 14, 30];
  let interval = 1;
  if (grade === 'again') {
    item.successStreak = 0;
    item.status = 'learning';
  } else {
    const step = grade === 'easy' ? 2 : 1;
    item.successStreak = Math.min(Number(item.successStreak || 0) + step, intervals.length);
    interval = intervals[Math.min(item.successStreak - 1, intervals.length - 1)];
    item.status = item.successStreak >= 5 ? 'mastered' : 'learning';
  }
  item.nextReviewAt = addLocalDays(at, interval).toISOString();
  item.updatedAt = item.lastReviewedAt;
  return item;
}

export function dueLexicon(state, now, skill) {
  const at = now ? new Date(now) : new Date();
  return (state.lexicon || []).filter(item => {
    if (skill && (item.skill === 'speaking' ? 'speaking' : 'writing') !== skill) return false;
    return !item.nextReviewAt || new Date(item.nextReviewAt) <= at;
  });
}

export function lexiconSentenceMatches(term, guess) {
  const clean = value => String(value || '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, '').replace(/\s+/g, ' ');
  return Boolean(clean(term)) && clean(term) === clean(guess);
}

export function parseLexiconSuggestions(text) {
  const categoryMap = { '词汇': 'word', word: 'word', '词组': 'phrase', phrase: 'phrase', '短语': 'phrase', '句式': 'sentence', sentence: 'sentence' };
  const rows = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('|'));
  return rows.map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(cells => {
    return cells.length >= 5 && cells[0] && !/^[-:]+$/.test(cells[0]) && !/^(类型|category)$/i.test(cells[0]);
  }).map(cells => ({
    category: categoryMap[cells[0].toLocaleLowerCase()] || categoryMap[cells[0]] || 'phrase', term: cells[1], meaning: cells[2], example: cells[3],
    tags: String(cells[4] || '').split(/[;,；，]/).map(value => value.trim()).filter(Boolean),
  })).filter(item => item.term);
}
