import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a recording stays on the account', () => {
  const desk = readFileSync('src/features/speaking/SpeakingDeskPage.tsx', 'utf8');
  assert.match(desk, /Recordings stay on this account\./);
  assert.match(desk, /Could not store the recording\. Saving the transcript only\./);
  assert.equal(desk.includes('in this browser'), false);
});
