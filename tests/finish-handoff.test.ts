import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a normal export toast names the outside score, and a mock toast names only the next part', () => {
  const source = readFileSync('src/context/FieldbookContext.tsx', 'utf8');
  assert.match(
    source,
    /Essay saved, and the score request was exported\. Score it outside Fieldbook, then import the scored file\./,
  );
  assert.match(
    source,
    /Saved, and the score request was exported\. Score it outside Fieldbook, then import the scored file\./,
  );
  assert.match(source, /toast\('Task 1 is saved\. Task 2 is next, 40 minutes\.'\)/);
  assert.match(source, /'Part 1 is saved\. Part 2 is next\.'/);
  assert.match(source, /'Part 2 is saved\. Part 3 is next\.'/);
});
