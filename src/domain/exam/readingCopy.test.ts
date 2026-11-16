import { expect, test } from 'vitest';
import { readingCopy } from './readingCopy';
import { makeTextAnchor, resolveTextAnchor } from './annotations';
test('verified twins copy repairs are scoped, idempotent, and retain paragraph labels', () => {
  const raw = "B DNA,researchers differ. J different.Epigenetics is important. D phrase‘nature and nurture'. G a‘third component'.";
  const repaired = readingCopy('passage:1010', raw);
  expect(repaired).toBe("B DNA, researchers differ. J different. Epigenetics is important. D phrase ‘nature and nurture'. G a ‘third component'.");
  expect(readingCopy('passage:1010', repaired)).toBe(repaired);
  expect(readingCopy('other-passage', raw)).toBe(raw);
});
test('an existing annotation across a repaired import typo still locates the same words', () => {
  const raw = 'B Half their DNA,researchers can quantify genetic effects.';
  const start = raw.indexOf('DNA');
  const anchor = makeTextAnchor('passage:passage:1010:paragraph:1010:1', raw, start, start + 'DNA,researchers'.length, 'original');
  const fixed = readingCopy('passage:1010', raw);
  const range = resolveTextAnchor(anchor, fixed, 'original');
  expect(range).not.toBeNull();
  expect(fixed.slice(range!.start, range!.end)).toBe('DNA, researchers');
});
