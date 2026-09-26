import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the release step is a push to master', () => {
  const deploy = readFileSync('README.md', 'utf8').split('## Deploy')[1].split('## ')[0];
  assert.match(deploy, /Push `master`/);
  assert.match(deploy, /https:\/\/ielts-fieldbook\.pages\.dev/);
  assert.equal(deploy.includes('npm run deploy:pages'), false);
});
