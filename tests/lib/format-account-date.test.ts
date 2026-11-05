import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatAccountDate, formatDateKey } from '../../src/lib/format';

test('account dates use the English short month', () => {
  assert.equal(formatAccountDate('2026-09-25T12:00:00'), '25 Sept 2026');
});

test('a missing or unparseable account date is an em dash', () => {
  assert.equal(formatAccountDate(undefined), '—');
  assert.equal(formatAccountDate(''), '—');
  assert.equal(formatAccountDate('not-a-date'), '—');
});

test('plan date keys read as a short weekday and date, with the year only outside the current year', () => {
  assert.equal(formatDateKey('2020-01-01', new Date(2026, 9, 17)), 'Wed 1 Jan 2020');
  assert.equal(formatDateKey('2026-11-03', new Date(2026, 10, 4)), 'Tue 3 Nov');
});

test('a value that is not a plan date key is returned unchanged', () => {
  assert.equal(formatDateKey('bad'), 'bad');
});
