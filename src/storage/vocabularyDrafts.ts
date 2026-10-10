import { normalizeVocabularyPreferences } from '../domain/vocabulary/preferences';
import type { VocabularyPracticeMode } from '../domain/vocabulary/preferences';
import type { VocabularyPracticeSession, VocabularySessionAnswer } from '../domain/vocabulary/session';
import type { ReviewQueueFilter } from '../domain/vocabulary/types';

const key = (owner: string) => `fieldbook-vocabulary-draft-v1:${owner}`;
const modes: VocabularyPracticeMode[] = ['dictation', 'definition', 'cloze', 'distinction', 'production', 'audio'];
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 500 && value.trim() === value && !['__proto__', 'prototype', 'constructor'].includes(value);
const time = (value: unknown): value is string => typeof value === 'string' && value.length < 100 && Number.isFinite(Date.parse(value));

// Build an explicit snapshot so entry definitions and hidden expected answers never reach storage.
function snapshot(value: unknown): VocabularyPracticeSession | null {
  const input = object(value);
  if (!input || !identifier(input.id) || !modes.includes(input.mode as VocabularyPracticeMode) || !time(input.startedAt) || !['active', 'paused'].includes(String(input.status)) || !Array.isArray(input.cardIds) || !input.cardIds.length || input.cardIds.length > 100) return null;
  if (input.submittedAt !== undefined && !time(input.submittedAt)) return null;
  const ids = new Set<string>();
  const cardIds: VocabularyPracticeSession['cardIds'] = [];
  for (const raw of input.cardIds) {
    const card = object(raw);
    if (!card || !identifier(card.id) || !identifier(card.entryId) || !identifier(card.senseId) || card.mode !== input.mode || ids.has(card.id)) return null;
    ids.add(card.id);
    cardIds.push({ id: card.id, entryId: card.entryId, senseId: card.senseId, mode: card.mode as VocabularyPracticeMode });
  }
  const rawAnswers = object(input.answers);
  if (!rawAnswers || Object.keys(rawAnswers).length > cardIds.length) return null;
  const answers: Record<string, VocabularySessionAnswer> = {};
  for (const [cardId, raw] of Object.entries(rawAnswers)) {
    const answer = object(raw);
    if (!ids.has(cardId) || !answer || typeof answer.response !== 'string' || answer.response.length > 10000 || !time(answer.answeredAt) || typeof answer.durationMs !== 'number' || !Number.isFinite(answer.durationMs) || answer.durationMs < 0) return null;
    if (answer.result !== undefined && !['success', 'failure', 'partial', 'pending'].includes(String(answer.result))) return null;
    if (answer.verification !== undefined && !['self-reported', 'pending'].includes(String(answer.verification))) return null;
    answers[cardId] = {
      response: answer.response, answeredAt: answer.answeredAt, durationMs: answer.durationMs,
      ...(answer.result ? { result: answer.result as VocabularySessionAnswer['result'] } : {}),
      ...(answer.verification ? { verification: answer.verification as VocabularySessionAnswer['verification'] } : {}),
      ...(typeof answer.flagged === 'boolean' ? { flagged: answer.flagged } : {}),
      ...(typeof answer.revealed === 'boolean' ? { revealed: answer.revealed } : {}),
      ...(typeof answer.checked === 'boolean' ? { checked: answer.checked } : {}),
    };
  }
  if (typeof input.index !== 'number' || !Number.isInteger(input.index) || input.index < 0 || input.index > cardIds.length) return null;
  const filterInput = object(input.filter) || {};
  const filter: ReviewQueueFilter = {};
  for (const name of ['entryId', 'senseId', 'bookId', 'unitId', 'sourceType'] as const) if (identifier(filterInput[name])) filter[name] = filterInput[name];
  if (['writing', 'speaking', 'listening', 'reading'].includes(String(filterInput.skill))) filter.skill = filterInput.skill as ReviewQueueFilter['skill'];
  if (['meaning', 'listening', 'spelling', 'usage'].includes(String(filterInput.dimension))) filter.dimension = filterInput.dimension as ReviewQueueFilter['dimension'];
  if (modes.includes(filterInput.mode as VocabularyPracticeMode) && filterInput.mode !== 'audio') filter.mode = filterInput.mode as ReviewQueueFilter['mode'];
  if (typeof filterInput.dueOnly === 'boolean') filter.dueOnly = filterInput.dueOnly;
  if (time(filterInput.now)) filter.now = filterInput.now;
  if (filterInput.now instanceof Date && Number.isFinite(filterInput.now.getTime())) filter.now = filterInput.now.toISOString();
  if (typeof filterInput.wrongOnly === 'boolean') Object.assign(filter, { wrongOnly: filterInput.wrongOnly });
  return { id: input.id, mode: input.mode as VocabularyPracticeMode, preferences: { ...normalizeVocabularyPreferences(input.preferences), mode: input.mode as VocabularyPracticeMode }, filter, cardIds, answers, index: input.index, status: input.status as VocabularyPracticeSession['status'], startedAt: input.startedAt, ...(time(input.submittedAt) ? { submittedAt: input.submittedAt } : {}) };
}

export function readVocabularyDraft(owner: string | null): VocabularyPracticeSession | null {
  if (!owner?.trim()) return null;
  try {
    const stored = object(JSON.parse(localStorage.getItem(key(owner)) || 'null'));
    return stored?.version === 1 && time(stored.savedAt) ? snapshot(stored.session) : null;
  } catch { return null; }
}
export function writeVocabularyDraft(owner: string | null, session: VocabularyPracticeSession): boolean {
  if (!owner?.trim()) return false;
  try {
    const safe = snapshot(session);
    if (!safe) return false;
    localStorage.setItem(key(owner), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), session: safe }));
    return true;
  } catch { return false; }
}
export function clearVocabularyDraft(owner: string | null): void {
  if (!owner?.trim()) return;
  try { localStorage.removeItem(key(owner)); } catch { /* Recovery storage may be disabled. */ }
}
