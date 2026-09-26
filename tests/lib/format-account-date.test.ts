import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatAccountDate } from '../../src/lib/format';

test('account dates use the English short month', () => {
  assert.equal(formatAccountDate('2026-09-25T12:00:00'), '25 Sept 2026');
});

test('a missing or unparseable account date is an em dash', () => {
  assert.equal(formatAccountDate(undefined), '—');
  assert.equal(formatAccountDate(''), '—');
  assert.equal(formatAccountDate('not-a-date'), '—');
});
