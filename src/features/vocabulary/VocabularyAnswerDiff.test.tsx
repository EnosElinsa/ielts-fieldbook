import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { VocabularyAnswerDiff } from "./VocabularyAnswerDiff";
afterEach(cleanup);
test("DOM text preserves exact copyable originals while missing positions are accessible", () => {
  const view = render(
    <VocabularyAnswerDiff response="tobaco" expected="tobacco" side="actual" />,
  );
  expect(view.container.textContent).toBe("tobaco");
  expect(
    view.container
      .querySelector(".practice-answer-missing")
      ?.getAttribute("aria-label"),
  ).toMatch(/Missing c/);
  expect(
    view.container
      .querySelector(".practice-aligned-answer")
      ?.getAttribute("aria-label"),
  ).toContain("Response: tobaco. Expected: tobacco.");
  view.rerender(
    <VocabularyAnswerDiff
      response="tobaco"
      expected="tobacco"
      side="expected"
    />,
  );
  expect(view.container.textContent).toBe("tobacco");
  expect(
    view.container.querySelectorAll(".practice-answer-correct").length,
  ).toBeGreaterThan(3);
});
