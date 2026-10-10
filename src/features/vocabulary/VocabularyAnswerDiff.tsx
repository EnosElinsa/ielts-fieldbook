import { alignVocabularyAnswer, describeAnswerEdits } from "./answerDiff";
export function VocabularyAnswerDiff({
  response,
  expected,
  side,
}: {
  response: string;
  expected: string;
  side: "actual" | "expected";
}) {
  const { operations } = alignVocabularyAnswer(response, expected);
  return (
    <>
      <span
        className="practice-aligned-answer"
        aria-label={
          side === "actual"
            ? `Response: ${response}. Expected: ${expected}. ${describeAnswerEdits(operations)}.`
            : undefined
        }
      >
        {operations.map((operation, index) =>
          side === "actual" ? (
            operation.kind === "missing" ? (
              <span
                key={index}
                className="practice-answer-missing"
                data-missing={operation.expected}
                aria-label={`Missing ${operation.expected} at position ${operation.actualIndex + 1}`}
              />
            ) : operation.kind === "equal" ? (
              <span key={index}>{operation.actual}</span>
            ) : (
              <mark key={index} className="practice-answer-difference">
                {operation.actual}
              </mark>
            )
          ) : operation.kind === "extra" ? null : (
            <span
              key={index}
              className={
                operation.kind === "equal"
                  ? "practice-answer-correct"
                  : "practice-answer-required"
              }
            >
              {operation.expected}
            </span>
          ),
        )}
      </span>
    </>
  );
}
