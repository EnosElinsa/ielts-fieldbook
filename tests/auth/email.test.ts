import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emailsMatch } from '../../src/auth/email';

test('emailsMatch ignores case and surrounding spaces', () => {
  assert.equal(emailsMatch('  EnosElinsa@gmail.com ', 'enoselinsa@gmail.com'), true);
  assert.equal(emailsMatch('other@gmail.com', 'enoselinsa@gmail.com'), false);
  assert.equal(emailsMatch('', 'enoselinsa@gmail.com'), false);
});
