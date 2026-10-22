import { expect, test } from 'vitest';
import { safeExamReturn } from './ExamNavigation';

test.each([
  '/listening/review/attempt?planId=task#exam-review-q2',
  '/listening/section?attempt=session',
  '/reading/source/section?returnTo=%2Freading%2Freview%2Fattempt',
  '/listening/intensive/section?sentence=s1',
])('preserves an explicit study return address: %s', value => {
  expect(safeExamReturn(value, '/listening')).toBe(value);
});

test.each(['https://example.com', '//example.com', '/account', '/listening/../account', '/listening/%2e%2e/account', '/listening/%5caccount', '/listening/section\n', null])('rejects an unrelated return address: %s', value => {
  expect(safeExamReturn(value, '/listening')).toBe('/listening');
});
