import { expect, test } from 'vitest';
import { isQuestionAnswered, questionAnsweredSlots, questionLabel, questionSlotCount } from './questionSlots';

const pooled = { number: 25, type: 'multiple' as const, points: 2, options: ['A', 'B', 'C'] };
test('pooled numbering and completeness share the same slot count', () => {
  expect(questionLabel(pooled)).toBe('Questions 25–26');
  expect(questionAnsweredSlots(pooled, ['A'])).toBe(1);
  expect(isQuestionAnswered(pooled, ['A'])).toBe(false);
  expect(isQuestionAnswered(pooled, ['A', 'B'])).toBe(true);
});
test('duplicate, blank and unavailable choices never inflate progress', () => {
  expect(questionAnsweredSlots(pooled, ['A', 'A', ' ', 'missing'])).toBe(1);
  expect(questionAnsweredSlots(pooled, ['A', 'B', 'C'])).toBe(2);
});
test('legacy multiple choice has one numbered answer while ordinary numbers are not scoring weights', () => {
  expect(questionSlotCount({ number: 1, type: 'gap', points: 2 })).toBe(1);
  expect(questionLabel({ number: 1, type: 'multiple' })).toBe('Question 1');
  expect(isQuestionAnswered({ number: 1, type: 'multiple' }, ['A', 'B'])).toBe(true);
  expect(isQuestionAnswered({ number: 1 }, '  ')).toBe(false);
});
