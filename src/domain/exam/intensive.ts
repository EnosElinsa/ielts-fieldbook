import type { IntensiveSession } from './types';

export type DictationToken = { text: string; kind: 'same' | 'missing' | 'extra' };
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const normalized = (word: string) => word.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]/gu, '');

/** A word-level LCS keeps omissions from shifting the rest of the transcript. */
export function lcsDiff(actual: string, expected: string): DictationToken[] {
  const a = words(actual), e = words(expected);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => Array(e.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = e.length - 1; j >= 0; j--) {
      table[i][j] = normalized(a[i]) === normalized(e[j]) ? 1 + table[i + 1][j + 1] : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const tokens: DictationToken[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < e.length) {
    if (i < a.length && j < e.length && normalized(a[i]) === normalized(e[j])) {
      tokens.push({ text: e[j++], kind: 'same' }); i++;
    } else if (i < a.length && (j === e.length || table[i + 1][j] > table[i][j + 1])) {
      tokens.push({ text: a[i++], kind: 'extra' });
    } else {
      tokens.push({ text: e[j++], kind: 'missing' });
    }
  }
  return tokens;
}

export function calculateDictationResult(actual: string, expected: string): IntensiveSession['dictationResult'] {
  if (!actual.trim() || !expected.trim()) return 'pending';
  const tokens = lcsDiff(actual, expected);
  const matches = tokens.filter(token => token.kind === 'same').length;
  if (tokens.every(token => token.kind === 'same')) return 'correct';
  return matches / Math.max(words(actual).length, words(expected).length) >= 0.5 ? 'partial' : 'wrong';
}

export function createIntensiveSession(sectionId: string, sentenceId: string, now = new Date().toISOString()): IntensiveSession {
  return { id: `intensive:${sectionId}:${sentenceId}`, sectionId, sentenceId, stage: 0, gist: '', transcriptInput: '', replayCount: 0, listened: false, revealed: false, dictationResult: 'pending', errorReasons: [], updatedAt: now, speed: 1, loop: false };
}

export function nextIntensiveReview(result: IntensiveSession['dictationResult'], rating: number, now = new Date().toISOString()): string {
  const days = result === 'wrong' || result === 'pending' || rating <= 2 ? 1 : result === 'partial' || rating === 3 ? 2 : rating === 4 ? 4 : 7;
  return new Date(new Date(now).getTime() + days * 86_400_000).toISOString();
}

export type IntensiveAction = 'listened' | 'reveal' | 'shadowed' | 'blind-replayed' | 'complete' | 'review';
export function applyIntensiveStage(session: IntensiveSession, action: IntensiveAction, now = new Date().toISOString()): IntensiveSession {
  if (action === 'review') {
    const { gist, transcriptInput, dictationResult, errorReasons, shadowingAudioId, selfRating, completedAt, nextReviewAt } = session;
    const history = completedAt ? [...(session.reviewHistory || []), { gist, transcriptInput, dictationResult, errorReasons, shadowingAudioId, selfRating, completedAt, nextReviewAt }] : session.reviewHistory;
    return { ...session, stage: 0, gist: '', transcriptInput: '', dictationResult: 'pending', errorReasons: [], shadowingAudioId: undefined, selfRating: undefined, listened: false, revealed: false, blindReplayDone: false, completedAt: undefined, reviewHistory: history, updatedAt: now };
  }
  if (action === 'listened') return { ...session, listened: true, stage: Math.max(session.stage, 1), updatedAt: now };
  if (action === 'reveal' && session.listened && session.transcriptInput.trim()) return { ...session, revealed: true, stage: Math.max(session.stage, 2), updatedAt: now };
  if (action === 'shadowed' && session.revealed && session.shadowingAudioId) return { ...session, stage: Math.max(session.stage, 3), updatedAt: now };
  if (action === 'blind-replayed' && session.stage >= 3) return { ...session, revealed: false, blindReplayDone: true, stage: Math.max(session.stage, 4), updatedAt: now };
  if (action === 'complete' && session.listened && session.stage >= 4 && session.shadowingAudioId && session.blindReplayDone && session.selfRating && session.dictationResult !== 'pending') {
    return { ...session, stage: 6, completedAt: now, nextReviewAt: nextIntensiveReview(session.dictationResult, session.selfRating, now), updatedAt: now };
  }
  return session;
}

export function sentenceProgress(session: IntensiveSession | undefined): number {
  return session ? Math.round(Math.min(6, Math.max(0, session.stage)) / 6 * 100) : 0;
}
