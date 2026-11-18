import { expect, test } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import { getLearnedVocabularyIds } from '../../src/domain/vocabulary/progress';
import type { VocabularyReview, VocabularyState } from '../../src/domain/vocabulary/types';

function scheduled(entryId: string, patch: Partial<VocabularyState> = {}): VocabularyState {
  return { id: entryId, entryId, senseId: 'meaning', manualStatus: 'new', dimensions: {} as VocabularyState['dimensions'],
    cards: { definition: createEmptyCard(new Date('2026-01-01')) }, wrong: { active: false, successesSinceFailure: 0, modes: {} },
    reviewCount: 0, updatedAt: '2026-01-01', ...patch };
}
function review(entryId: string, patch: Partial<VocabularyReview> = {}): VocabularyReview {
  return { id: entryId, entryId, senseId: 'meaning', mode: 'definition', result: 'success',
    occurredAt: '2026-01-01', updatedAt: '2026-01-01', ...patch };
}

test.each([
  ['a schedule with no history', [], true],
  ['a schedule with only blank answers', [review('word', { response: '  ' })], false],
  ['a schedule with only pending imported answers', [review('word', { imported: true, result: 'pending' })], false],
  ['a nonblank incorrect answer', [review('word', { response: 'an attempt', result: 'failure' })], true],
  ['an imported incorrect answer without response text', [review('word', { imported: true, result: 'failure' })], true],
  ['mixed blank and answered history', [review('word'), review('word', { response: 'word' })], true],
  ['unrelated history', [review('another-word')], true],
] as const)('learned progress preserves %s', (_label, vocabularyReviews, expected) => {
  const state = { vocabularyStates: [scheduled('word')], vocabularyReviews: [...vocabularyReviews] };
  const before = structuredClone(state);
  expect(getLearnedVocabularyIds(state).has('word')).toBe(expected);
  expect(state).toEqual(before);
});

test('unscheduled words still require an attempt or an explicit manual status', () => {
  expect([...getLearnedVocabularyIds({ vocabularyStates: [scheduled('invalid', { cards: { definition: { ...createEmptyCard(), due: 'invalid' } } }),
    scheduled('unscheduled', { cards: {} }), scheduled('manual', { cards: {}, manualStatus: 'active' })],
    vocabularyReviews: [review('answered', { response: 'attempt', result: 'failure' }), review('blank')] })].sort())
    .toEqual(['answered', 'manual']);
});

test('large scheduled collections inspect review identities a bounded number of times', () => {
  let inspected = 0;
  const vocabularyReviews = Array.from({ length: 1000 }, (_, i) => ({ ...review(`word-${i}`, { response: 'attempt' }),
    get entryId() { inspected++; return `word-${i}`; } }));
  const learned = getLearnedVocabularyIds({ vocabularyStates: Array.from({ length: 400 }, (_, i) => scheduled(`word-${i}`)), vocabularyReviews });
  expect(learned.size).toBe(1000);
  // The account history must not be scanned once for every scheduled meaning.
  expect(inspected).toBeLessThanOrEqual(vocabularyReviews.length * 3);
});
