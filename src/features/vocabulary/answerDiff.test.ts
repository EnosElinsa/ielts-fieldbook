import { expect, test } from "vitest";
import {
  alignVocabularyAnswer,
  closestAcceptedAnswer,
  describeAnswerEdits,
} from "./answerDiff";
test.each([
  ["peal", "peel", 1],
  ["tobaco", "tobacco", 1],
  ["scripe", "strip", 2],
  ["axcyef", "abcdef", 2],
  ["teh", "the", 2],
])("aligns %s to %s with separate edits", (actual, expected, distance) => {
  const result = alignVocabularyAnswer(actual as string, expected as string);
  expect(result.distance).toBe(distance);
  expect(result.operations.map((operation) => operation.actual).join("")).toBe(
    actual,
  );
  expect(
    result.operations.map((operation) => operation.expected).join(""),
  ).toBe(expected);
});
test("finds separated substitutions and missing positions rather than a broad marked span", () => {
  expect(
    alignVocabularyAnswer("axcyef", "abcdef")
      .operations.filter((operation) => operation.kind === "replace")
      .map((operation) => operation.actualIndex),
  ).toEqual([1, 3]);
  expect(
    describeAnswerEdits(alignVocabularyAnswer("tobaco", "tobacco").operations),
  ).toMatch(/Missing c at position 5|Missing c at position 6/);
  expect(alignVocabularyAnswer("Word", "word").distance).toBe(0);
});
test("uses the closest frozen accepted variant and supports legacy slash answers", () => {
  expect(closestAcceptedAnswer("colur", "wrong", ["color", "colour"])).toBe(
    "color",
  );
  expect(closestAcceptedAnswer("fesh", "fresh / new")).toBe("fresh");
  expect(closestAcceptedAnswer("oragne", "orange/apple")).toBe("orange");
});
