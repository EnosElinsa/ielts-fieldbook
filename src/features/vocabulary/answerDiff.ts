export type AnswerOperation = {
  kind: "equal" | "replace" | "extra" | "missing";
  actual: string;
  expected: string;
  actualIndex: number;
  expectedIndex: number;
};
const same = (a: string, b: string) =>
  a.normalize("NFKC").toLocaleLowerCase() ===
  b.normalize("NFKC").toLocaleLowerCase();
/** Levenshtein alignment preserves both original strings and each individual error. */
export function alignVocabularyAnswer(
  actual: string,
  expected: string,
): {
  distance: number;
  operations: AnswerOperation[];
} {
  const a = Array.from(actual),
    b = Array.from(expected);
  const d = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j - 1] + (same(a[i - 1], b[j - 1]) ? 0 : 1),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      );
  const operations: AnswerOperation[] = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (
      i &&
      j &&
      d[i][j] === d[i - 1][j - 1] + (same(a[i - 1], b[j - 1]) ? 0 : 1)
    ) {
      operations.push({
        kind: same(a[i - 1], b[j - 1]) ? "equal" : "replace",
        actual: a[i - 1],
        expected: b[j - 1],
        actualIndex: i - 1,
        expectedIndex: j - 1,
      });
      i--;
      j--;
    } else if (i && d[i][j] === d[i - 1][j] + 1) {
      operations.push({
        kind: "extra",
        actual: a[i - 1],
        expected: "",
        actualIndex: i - 1,
        expectedIndex: j,
      });
      i--;
    } else {
      operations.push({
        kind: "missing",
        actual: "",
        expected: b[j - 1],
        actualIndex: i,
        expectedIndex: j - 1,
      });
      j--;
    }
  }
  return { distance: d[a.length][b.length], operations: operations.reverse() };
}
export function closestAcceptedAnswer(
  response: string,
  expected: string,
  accepted?: string[],
) {
  const options = accepted?.filter(Boolean).length
    ? accepted.filter(Boolean)
    : expected.split(/\s+\/\s+|\s*\/\s*/).filter(Boolean);
  return options.reduce(
    (closest, value) =>
      alignVocabularyAnswer(response, value).distance <
      alignVocabularyAnswer(response, closest).distance
        ? value
        : closest,
    options[0] || expected,
  );
}
export function describeAnswerEdits(operations: AnswerOperation[]) {
  return operations
    .filter((operation) => operation.kind !== "equal")
    .map((operation) =>
      operation.kind === "missing"
        ? `Missing ${operation.expected} at position ${operation.actualIndex + 1}`
        : operation.kind === "extra"
          ? `Extra ${operation.actual} at position ${operation.actualIndex + 1}`
          : `Replace ${operation.actual} with ${operation.expected} at position ${operation.actualIndex + 1}`,
    )
    .join(". ");
}
