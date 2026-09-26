import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Account link uses the initials circle', () => {
  const shell = readFileSync('src/components/Shell.tsx', 'utf8');
  assert.match(shell, /<AccountMark user=\{accountUser\} size="nav" \/>/);
  assert.equal(shell.includes('{NavIcons.account}'), false);
});
