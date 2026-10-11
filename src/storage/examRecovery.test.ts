import { beforeEach, expect, test } from 'vitest';
import { readExamRecovery, writeExamRecovery, clearExamRecovery, clearAccountExamRecovery } from './examRecovery';
beforeEach(() => localStorage.clear());
test('recovery is isolated by account and entry and survives reload', () => {
  writeExamRecovery('one', 'reading:s', { responses: { q: 'a' } });
  expect(readExamRecovery('two', 'reading:s')).toBeNull();
  expect(readExamRecovery('one', 'listening:s')).toBeNull();
  expect(readExamRecovery('one', 'reading:s')).toEqual({ responses: { q: 'a' } });
  clearExamRecovery('one', 'reading:s');
  expect(readExamRecovery('one', 'reading:s')).toBeNull();
});
test('account cleanup removes all its exam drafts while preserving other accounts', () => {
  writeExamRecovery('one', 'reading:s', { x: 1 });
  writeExamRecovery('one', 'intensive:s', { x: 2 });
  writeExamRecovery('two', 'reading:s', { x: 3 });
  clearAccountExamRecovery('one');
  expect(readExamRecovery('one', 'reading:s')).toBeNull();
  expect(readExamRecovery('one', 'intensive:s')).toBeNull();
  expect(readExamRecovery('two', 'reading:s')).toEqual({ x: 3 });
});
test('anonymous drafts and malformed recovery cannot leak into signed in accounts', () => {
  expect(writeExamRecovery(null, 's', { x: 1 })).toBe(false);
  localStorage.setItem('fieldbook-exam-recovery-v1:one:s', 'broken');
  expect(readExamRecovery('one', 's')).toBeNull();
});
