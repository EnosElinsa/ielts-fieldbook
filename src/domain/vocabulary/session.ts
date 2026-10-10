import { hashText, makeId, nowIso } from '../utils';
import { normalizeAnswer, recordAudioActivity, recordVocabularyReview } from './index';
import type { ReviewCard, ReviewQueueFilter, VocabularyResult, VocabularyStore } from './types';
import type { VocabularyPracticeMode, VocabularyPreferences } from './preferences';
import { normalizeVocabularyPreferences } from './preferences';

export type VocabularySessionAnswer = {
  response: string; result?: VocabularyResult; verification?: 'self-reported' | 'pending';
  answeredAt: string; durationMs: number; flagged?: boolean; revealed?: boolean; checked?: boolean;
};
export type VocabularyPracticeSession = {
  id: string; mode: VocabularyPracticeMode; preferences: VocabularyPreferences; filter: ReviewQueueFilter;
  cardIds: { id: string; entryId: string; senseId: string; mode: VocabularyPracticeMode }[];
  answers: Record<string, VocabularySessionAnswer>; index: number;
  status: 'active' | 'paused' | 'submitted'; startedAt: string; submittedAt?: string;
};
export type VocabularySessionSnapshot = VocabularyPracticeSession;
export type VocabularySessionResult = {
  cardId: string; entryId: string; senseId: string; term: string; expectedAnswer: string;
  response: string; result: VocabularyResult; definition: string; example: string; errorType?: string;
};
export type VocabularySessionSummary = { total: number; correct: number; incorrect: number; pending: number; listened?: number };
export type VocabularySessionRecord = {
  id: string; mode: VocabularyPracticeMode; status: 'submitted'; startedAt: string; submittedAt: string;
  preferences: VocabularyPreferences; filter: ReviewQueueFilter; summary: VocabularySessionSummary;
  results: VocabularySessionResult[]; entryIds: string[]; reviewIds: string[]; updatedAt: string;
};
export function createVocabularySession(cards: ReviewCard[], mode: VocabularyPracticeMode, preferences: unknown, filter: ReviewQueueFilter = {}): VocabularyPracticeSession {
  const normalized = { ...normalizeVocabularyPreferences(preferences), mode };
  const id = makeId('vocab-session');
  const unique = new Map<string, ReviewCard>();
  cards.forEach(card => {
    const id = card.id;
    if (!unique.has(id)) unique.set(id, card);
  });
  let selected = [...unique.values()];
  if (mode === 'dictation' || mode === 'audio') {
    const entries = new Set<string>();
    selected = selected.filter(card => entries.has(card.entryId) ? false : (entries.add(card.entryId), true));
  }
  if (normalized.order === 'due') selected.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
  if (normalized.order === 'random') selected.sort((a, b) => hashText(`${id}:${a.id}`).localeCompare(hashText(`${id}:${b.id}`)) || a.id.localeCompare(b.id));
  selected = selected.slice(0, normalized.sessionSize);
  const startedAt = nowIso();
  return {
    id, mode, preferences: normalized, filter: { ...filter },
    cardIds: selected.map(card => ({ id: card.id, entryId: card.entryId, senseId: card.senseId, mode })),
    answers: {}, index: 0, status: 'active', startedAt,
  };
}
export function updateVocabularySessionAnswer(session: VocabularyPracticeSession, cardId: string, response: string, options: Partial<Pick<VocabularySessionAnswer, 'durationMs' | 'result' | 'verification'>> = {}): VocabularyPracticeSession {
  if (session.status === 'submitted') throw new Error('Submitted vocabulary sessions cannot be edited.');
  if (!session.cardIds.some(card => card.id === cardId)) throw new Error('Vocabulary card is not in this session.');
  const previous = session.answers[cardId];
  const answer: VocabularySessionAnswer = {
    response: typeof response === 'string' ? response.slice(0, 10000) : String(response || '').slice(0, 10000),
    answeredAt: nowIso(), durationMs: typeof options.durationMs === 'number' && Number.isFinite(options.durationMs) ? Math.max(0, options.durationMs) : 0,
    ...(options.result ? { result: options.result } : {}), ...(options.verification ? { verification: options.verification } : {}),
    ...(typeof previous?.flagged === 'boolean' ? { flagged: previous.flagged } : {}),
  };
  return { ...session, answers: { ...session.answers, [cardId]: answer } };
}
export function evaluateVocabularySessionAnswer(card: ReviewCard, response: string, options: Partial<Pick<VocabularySessionAnswer, 'result' | 'verification'>> = {}): VocabularySessionResult {
  const text = typeof response === 'string' ? response : String(response || '');
  const entry = card.entry;
  const sense = entry.senses.find(item => item.id === card.senseId) || entry.senses[0];
  const expectedAnswer = card.mode === 'distinction' ? sense?.distinctionTask?.answer || (sense?.synonyms || []).join(' / ') : entry.term;
  let result: VocabularyResult;
  let errorType: string | undefined;
  if (card.mode === 'production') {
    if (!normalizeAnswer(text)) { result = 'failure'; errorType = 'unanswered'; }
    else result = options.verification === 'self-reported' && (options.result === 'success' || options.result === 'partial' || options.result === 'failure') ? options.result : 'pending';
  } else if (card.mode === 'distinction') {
    const accepted = (sense?.distinctionTask?.answer ? [sense.distinctionTask.answer] : sense?.synonyms || []).map(normalizeAnswer).filter(Boolean);
    result = accepted.includes(normalizeAnswer(text)) ? 'success' : 'failure';
    if (!normalizeAnswer(text)) errorType = 'unanswered';
  } else {
    result = normalizeAnswer(text) === normalizeAnswer(expectedAnswer) && Boolean(normalizeAnswer(text)) ? 'success' : 'failure';
    if (!normalizeAnswer(text)) errorType = 'unanswered';
    else if (result === 'failure' && card.mode === 'dictation') {
      const expected = normalizeAnswer(expectedAnswer); const actual = normalizeAnswer(text);
      errorType = actual.length < expected.length ? 'missing letters' : actual.length > expected.length ? 'extra letters' : 'wrong letters or word form';
    }
  }
  return { cardId: card.id, entryId: card.entryId, senseId: card.senseId, term: entry.term, expectedAnswer, response: text, result, definition: sense?.definition || entry.meaning || '', example: sense?.example || entry.example || '', ...(errorType ? { errorType } : {}) };
}
export function buildVocabularySessionCommit<S extends VocabularyStore>(state: S, session: VocabularyPracticeSession, cards: ReviewCard[]): { state: S; sessionRecord: VocabularySessionRecord; results: VocabularySessionResult[]; summary: VocabularySessionSummary } {
  const targetState = structuredClone(state);
  const existing = (targetState as S & { vocabularySessions?: VocabularySessionRecord[] }).vocabularySessions || [];
  const prior = existing.find(record => record.id === session.id);
  if (prior) return { state: targetState, sessionRecord: structuredClone(prior), results: structuredClone(prior.results), summary: structuredClone(prior.summary) };
  if (session.status !== 'active' && session.status !== 'paused') throw new Error('Only active or paused vocabulary sessions can be submitted.');
  if (!session.cardIds.length || session.cardIds.length > 100) throw new Error('Vocabulary session size is invalid.');
  const byId = new Map(cards.map(card => [card.id, card]));
  const seen = new Set<string>();
  session.cardIds.forEach(ref => {
    if (seen.has(ref.id)) throw new Error('Vocabulary session contains duplicate cards.');
    seen.add(ref.id);
    const card = byId.get(ref.id);
    const entry = targetState.vocabulary.find(item => item.id === ref.entryId);
    if (!card || card.entryId !== ref.entryId || card.senseId !== ref.senseId || !entry || entry.tags.includes('archived') || !entry.senses.some(sense => sense.id === ref.senseId) || normalizeAnswer(card.entry.term) !== normalizeAnswer(entry.term) || ref.mode !== session.mode || (session.mode !== 'audio' && card.mode !== session.mode)) throw new Error('Vocabulary session card is stale.');
  });
  const submittedAt = session.submittedAt || nowIso();
  const audio = session.mode === 'audio';
  const results = session.cardIds.map(ref => {
    const card = byId.get(ref.id)!;
    const answer = session.answers[ref.id];
    const result = evaluateVocabularySessionAnswer(card, answer?.response || '', answer ? { result: answer.result, verification: answer.verification } : {});
    if (audio) {
      result.result = 'pending'; delete result.errorType;
      if (normalizeAnswer(answer?.response) === 'listened') {
        const activity = recordAudioActivity(targetState, ref.entryId, submittedAt);
        if (activity) Object.assign(activity, { id: `${session.id}:${ref.id}:audio`, sessionId: session.id });
      }
    } else {
      const source = card.sources?.find(source => source.type === session.filter.sourceType) || card.sources?.[0];
      recordVocabularyReview(targetState, { id: `${session.id}:${ref.id}`, entryId: ref.entryId, senseId: ref.senseId, mode: card.mode, result: result.result, response: result.response, occurredAt: submittedAt, durationMs: answer?.durationMs, verification: result.result === 'pending' ? 'pending' : card.mode === 'production' ? 'self-reported' : 'objective',
        sourceType: source?.type, sourceId: source?.id, bookId: session.filter.bookId || source?.bookId, unitId: session.filter.unitId || source?.unitId, skill: session.filter.skill || source?.skill,
      });
      const review = targetState.vocabularyReviews.find(item => item.id === `${session.id}:${ref.id}`) as unknown as Record<string, unknown> | undefined;
      if (review) review.sessionId = session.id;
      targetState.vocabularyEvidence.filter(event => event.id?.startsWith(`${session.id}:${ref.id}:`)).forEach(event => Object.assign(event, { sessionId: session.id }));
    }
    return result;
  });
  const summary: VocabularySessionSummary = { total: results.length, correct: audio ? 0 : results.filter(result => result.result === 'success').length, incorrect: audio ? 0 : results.filter(result => result.result === 'failure' || result.result === 'partial').length, pending: audio ? 0 : results.filter(result => result.result === 'pending').length, ...(audio ? { listened: results.filter(result => normalizeAnswer(session.answers[result.cardId]?.response) === 'listened').length } : {}) };
  const sessionRecord: VocabularySessionRecord = { id: session.id, mode: session.mode, status: 'submitted', startedAt: session.startedAt, submittedAt, preferences: structuredClone(session.preferences), filter: structuredClone(session.filter), summary, results: structuredClone(results), entryIds: [...new Set(session.cardIds.map(card => card.entryId))], reviewIds: session.mode === 'audio' ? [] : session.cardIds.map(card => `${session.id}:${card.id}`), updatedAt: submittedAt };
  (targetState as S & { vocabularySessions?: VocabularySessionRecord[] }).vocabularySessions = [...existing, sessionRecord];
  return { state: targetState, sessionRecord, results, summary };
}
