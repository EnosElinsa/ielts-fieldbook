import { beforeEach, expect, test } from 'vitest';
import { readExamRecoveries, readExamRecovery, writeExamRecovery, clearExamRecovery, clearAccountExamRecovery } from './examRecovery';
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

test('scoped recovery lookup includes plan and retry drafts only for the requested owner and source', () => {
  writeExamRecovery('one', 'reading:mock:paper', { id: 'base' });
  writeExamRecovery('one', 'reading:mock:paper:plan:p', { id: 'plan' });
  writeExamRecovery('one', 'reading:mock:paper:retry:a:plan:p', { id: 'retry' });
  writeExamRecovery('two', 'reading:mock:paper:plan:p', { id: 'other-owner' });
  writeExamRecovery('one', 'reading:mock:paper2', { id: 'other-paper' });
  writeExamRecovery('one', 'listening:mock:paper', { id: 'other-skill' });
  localStorage.setItem('fieldbook-exam-recovery-v1:one:reading:mock:paper:plan:broken', 'invalid');
  expect(readExamRecoveries('one', 'reading:mock:paper')).toEqual([{ id: 'base' }, { id: 'plan' }, { id: 'retry' }]);
  expect(readExamRecoveries(null, 'reading:mock:paper')).toEqual([]);
});
