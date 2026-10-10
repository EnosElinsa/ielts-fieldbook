import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { readVocabularyDraft, writeVocabularyDraft, clearVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { ReviewCard } from '../../src/domain/vocabulary/types';

const card = { id: 'entry:sense:dictation', entryId: 'entry', senseId: 'sense', mode: 'dictation', entry: { term: 'secret answer' } } as ReviewCard;
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('vocabulary draft recovery', () => {
  test('keeps answers by owner and clears only the requested account', () => {
    const session = updateVocabularySessionAnswer(createVocabularySession([card], 'dictation', {}), card.id, 'unfinished answer');
    expect(writeVocabularyDraft('alice', session)).toBe(true);
    expect(readVocabularyDraft('alice')?.answers[card.id].response).toBe('unfinished answer');
    expect(readVocabularyDraft('bob')).toBeNull();
    expect(writeVocabularyDraft(null, session)).toBe(false);
    expect(readVocabularyDraft(null)).toBeNull();
    clearVocabularyDraft('bob');
    expect(readVocabularyDraft('alice')).not.toBeNull();
    clearVocabularyDraft('alice');
    expect(readVocabularyDraft('alice')).toBeNull();
  });

  test('persists identifiers and answers without hidden card content', () => {
    const session = createVocabularySession([card], 'dictation', {});
    writeVocabularyDraft('alice', { ...session, cards: [card], expectedAnswer: 'secret answer' } as any);
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('secret answer');
    expect(readVocabularyDraft('alice')?.preferences.layout).toBe('list');
  });

  test('rejects corrupt, oversized or invalid identity snapshots', () => {
    const session = createVocabularySession([card], 'dictation', {});
    expect(writeVocabularyDraft('alice', { ...session, answers: { [card.id]: { response: 'x'.repeat(10001), answeredAt: session.startedAt, durationMs: 0 } } })).toBe(false);
    expect(writeVocabularyDraft('alice', { ...session, cardIds: Array.from({ length: 101 }, () => session.cardIds[0]) })).toBe(false);
    writeVocabularyDraft('alice', session);
    const key = localStorage.key(0)!;
    localStorage.setItem(key, '{');
    expect(readVocabularyDraft('alice')).toBeNull();
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: session.startedAt, session: { ...session, cardIds: [{ ...session.cardIds[0], entryId: '' }] } }));
    expect(readVocabularyDraft('alice')).toBeNull();
  });

  test('returns a safe failure when local storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(writeVocabularyDraft('alice', createVocabularySession([card], 'dictation', {}))).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readVocabularyDraft('alice')).toBeNull();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => clearVocabularyDraft('alice')).not.toThrow();
  });

  test('preserves safe review flags while rejecting foreign answer keys and submitted drafts', () => {
    const session = createVocabularySession([card], 'dictation', {});
    const edited = updateVocabularySessionAnswer(session, card.id, 'draft');
    edited.answers[card.id] = { ...edited.answers[card.id], flagged: true, checked: true, revealed: false };
    expect(writeVocabularyDraft('alice', edited)).toBe(true);
    expect(readVocabularyDraft('alice')?.answers[card.id]).toMatchObject({ flagged: true, checked: true, revealed: false });
    expect(writeVocabularyDraft('alice', { ...edited, status: 'submitted' })).toBe(false);
    expect(writeVocabularyDraft('alice', { ...edited, answers: { foreign: edited.answers[card.id] } })).toBe(false);
  });
});
