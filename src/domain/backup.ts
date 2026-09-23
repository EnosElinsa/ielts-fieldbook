// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { migrateState } from './state';

export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { valid: false, reason: 'The backup is not a data file.' };
  const recognized = ['sessions', 'assessments', 'lexicon', 'errors', 'drafts', 'settings', 'plans', 'stories'].some(key => Object.prototype.hasOwnProperty.call(payload, key));
  if (!recognized) return { valid: false, reason: 'No study data found in this file.' };
  for (const key of ['sessions', 'assessments', 'lexicon', 'errors', 'plans', 'stories']) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) return { valid: false, reason: `${key} is not a list.` };
  }
  return { valid: true, counts: {
    sessions: Array.isArray(payload.sessions) ? payload.sessions.length : 0,
    assessments: Array.isArray(payload.assessments) ? payload.assessments.length : 0,
    lexicon: Array.isArray(payload.lexicon) ? payload.lexicon.length : 0,
    errors: Array.isArray(payload.errors) ? payload.errors.length : 0,
    plans: Array.isArray(payload.plans) ? payload.plans.length : 0,
    stories: Array.isArray(payload.stories) ? payload.stories.length : 0,
  } };
}

export function mergeById(current, incoming) {
  const map = new Map();
  incoming.concat(current).forEach((item, index) => map.set(item.id || `legacy-${index}`, item));
  return Array.from(map.values());
}

export function mergeBackup(current, incoming, options) {
  const settings = Object.assign({ includeSettings: false }, options || {});
  const left = migrateState(current);
  const right = migrateState(incoming);
  left.questions = mergeById(left.questions, right.questions);
  left.sessions = mergeById(left.sessions, right.sessions);
  left.assessments = mergeById(left.assessments, right.assessments);
  left.lexicon = mergeById(left.lexicon, right.lexicon);
  left.errors = mergeById(left.errors, right.errors);
  left.plans = mergeById(left.plans, right.plans);
  left.stories = mergeById(left.stories, right.stories);
  left.drafts = Object.assign({}, right.drafts, left.drafts);
  if (settings.includeSettings) left.settings = Object.assign({}, left.settings, right.settings);
  return migrateState(left);
}
