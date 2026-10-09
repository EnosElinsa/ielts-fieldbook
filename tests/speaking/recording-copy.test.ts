import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a recording stays on the account', () => {
  const desk = readFileSync('src/features/speaking/SpeakingDeskPage.tsx', 'utf8');
  assert.match(desk, /Saved recordings are stored on your account\./);
  assert.match(desk, /Recording upload failed\. Your recording is still available here\./);
  assert.match(desk, /Continue with transcript only/);
  assert.match(desk, /Download recording/);
  assert.equal(desk.includes('in this browser'), false);
});
