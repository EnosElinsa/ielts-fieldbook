import { expect, test } from 'vitest';
import { questionNumberPrefixLength } from './questionPresentation';

test.each(['1. Describe a clock', '1 Describe a clock', '(1) Describe a clock', 'Question 1 · Describe a clock', '1) Describe a clock', '1.Describe a clock'])('matching source label is hidden: %s', prompt => {
  expect(prompt.slice(questionNumberPrefixLength(prompt, 1))).toBe('Describe a clock');
});

test.each(['10. Describe a clock', '1980 was the year', '1.5 million people', '1st place', 'There are 1 clocks', 'Question 10 · Describe a clock'])('source quantities and different labels remain: %s', prompt => {
  expect(questionNumberPrefixLength(prompt, 1)).toBe(0);
});
