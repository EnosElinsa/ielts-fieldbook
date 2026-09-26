import { test } from 'vitest';
import assert from 'node:assert/strict';
import { avatarLetters, initials } from '../../src/lib/identity';

test('initials take the first two Latin letters and skip spaces', () => {
  assert.equal(initials('enoselinsa'), 'EN');
  assert.equal(initials('Enos Elinsa'), 'EN');
  assert.equal(initials('a'), 'A');
  assert.equal(initials(''), 'A');
});

test('initials use the first character when the name has no Latin letter', () => {
  assert.equal(initials('林昭'), '林');
});

test('a missing user gets the letter A', () => {
  assert.equal(avatarLetters(null), 'A');
  assert.equal(
    avatarLetters({ email: 'enoselinsa@gmail.com', user_metadata: { display_name: 'enoselinsa' } }),
    'EN',
  );
});
