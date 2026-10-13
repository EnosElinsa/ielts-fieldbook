import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('an export toast explains importing feedback, and a mock toast names only the next part', () => {
  const source = readFileSync('src/context/FieldbookContext.tsx', 'utf8');
  assert.match(
    source,
    /Writing practice saved\. Feedback request exported\. Import the marked file when it is ready\./,
  );
  assert.match(
    source,
    /Speaking practice saved\. Feedback request exported\. Import the marked file when it is ready\./,
  );
  assert.match(source, /toast\('Task 1 is saved\. Task 2 is next, 40 minutes\.'\)/);
  assert.match(source, /'Part 1 is saved\. Part 2 is next\.'/);
  assert.match(source, /'Part 2 is saved\. Part 3 is next\.'/);
});
