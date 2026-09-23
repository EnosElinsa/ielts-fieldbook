// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { splitList, makeId, nowIso } from './utils';

export function normalizeStory(item, index) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = source.createdAt || nowIso();
  return {
    id: String(source.id || `legacy-story-${index}`),
    title: String(source.title || '').trim(),
    people: String(source.people || '').trim(),
    place: String(source.place || '').trim(),
    time: String(source.time || '').trim(),
    event: String(source.event || '').trim(),
    feeling: String(source.feeling || '').trim(),
    tags: splitList(source.tags),
    topicIds: splitList(source.topicIds),
    createdAt,
    updatedAt: source.updatedAt || createdAt,
  };
}

export function dedupeStories(stories) {
  const byId = new Map();
  stories.forEach(story => {
    const existing = byId.get(story.id);
    if (!existing) {
      byId.set(story.id, story);
      return;
    }
    const existingAt = String(existing.updatedAt || existing.createdAt || '');
    const nextAt = String(story.updatedAt || story.createdAt || '');
    const newer = nextAt > existingAt ? story : existing;
    const older = newer === story ? existing : story;
    ['title', 'people', 'place', 'time', 'event', 'feeling'].forEach(key => {
      if (!newer[key] && older[key]) newer[key] = older[key];
    });
    newer.tags = Array.from(new Set((newer.tags || []).concat(older.tags || [])));
    newer.topicIds = Array.from(new Set((newer.topicIds || []).concat(older.topicIds || [])));
    if (!newer.createdAt) newer.createdAt = older.createdAt;
    byId.set(story.id, newer);
  });
  return Array.from(byId.values());
}

export function addStory(state, input, deps) {
  const services = Object.assign({ id: () => makeId('story'), now: nowIso }, deps || {});
  const payload = input || {};
  if (!Array.isArray(state.stories)) state.stories = [];
  if (payload.id) {
    const existing = state.stories.find(item => item.id === payload.id);
    if (existing) return { item: updateStory(state, payload.id, payload, deps), duplicate: true };
  }
  const timestamp = services.now();
  const item = normalizeStory(Object.assign({}, payload, {
    id: payload.id || services.id(),
    createdAt: payload.createdAt || timestamp,
    updatedAt: timestamp,
  }), state.stories.length);
  state.stories.push(item);
  return { item, duplicate: false };
}

export function updateStory(state, storyId, changes, deps) {
  const item = (state.stories || []).find(entry => entry.id === storyId);
  if (!item) return null;
  const payload = changes || {};
  ['title', 'people', 'place', 'time', 'event', 'feeling'].forEach(key => {
    if (payload[key] !== undefined) item[key] = String(payload[key] || '').trim();
  });
  if (payload.tags !== undefined) item.tags = splitList(payload.tags);
  if (payload.topicIds !== undefined) item.topicIds = splitList(payload.topicIds);
  item.updatedAt = (deps && deps.now ? deps.now : nowIso)();
  return item;
}

export function removeStory(state, storyId) {
  if (!Array.isArray(state.stories)) return false;
  const index = state.stories.findIndex(item => item.id === storyId);
  if (index < 0) return false;
  state.stories.splice(index, 1);
  return true;
}
