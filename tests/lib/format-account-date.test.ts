import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatAccountDate, formatCount, formatDateKey, formatDateTime, plural } from '../../src/lib/format';

test('counts use thousands separators and plurals agree with the count', () => {
  assert.equal(formatCount(7021), '7,021');
  assert.equal(formatCount(undefined), '0');
  assert.equal(plural(1, 'topic'), '1 topic');
  assert.equal(plural(2, 'topic'), '2 topics');
  assert.equal(plural(0, 'session'), '0 sessions');
  assert.equal(plural(1240, 'entry', 'entries'), '1,240 entries');
});

test('date-times read as a short day, month and clock time', () => {
  assert.equal(formatDateTime('2026-10-14T11:23:00'), '14 Oct, 11:23');
});

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
  assert.equal(formatDateKey('2026-13-40'), '2026-13-40');
  assert.equal(formatDateKey('2026-02-30'), '2026-02-30');
});
