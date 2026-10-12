import { expect, test } from "vitest";
import { vocabularyLearningTimeline } from "./timeline";
const review = {
  id: "review:a",
  entryId: "word",
  senseId: "sense",
  mode: "dictation",
  result: "failure",
  response: "lifestock",
  occurredAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
} as const;
const evidence = (dimension: "listening" | "spelling", id?: string) =>
  ({
    ...review,
    id,
    dimension,
    sourceType: "personal",
    sourceId: "review:a",
    verification: "objective",
  }) as const;
test("explicit review dimension identities collapse once without modifying records", () => {
  const store = {
    vocabularyReviews: [review],
    vocabularyEvidence: [
      evidence("listening", "review:a:listening"),
      evidence("spelling", "review:a:spelling"),
    ],
  };
  const before = JSON.stringify(store);
  const events = vocabularyLearningTimeline(store, "word");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    dimensions: ["listening", "spelling"],
    result: "failure",
    response: "lifestock",
  });
  expect(JSON.stringify(store)).toBe(before);
});
test("same answer and timestamp without an explicit identity stay separate; other words excluded", () => {
  const events = vocabularyLearningTimeline(
    {
      vocabularyReviews: [review],
      vocabularyEvidence: [
        evidence("listening"),
        evidence("spelling", "legacy"),
        { ...evidence("spelling", "review:a:spelling"), entryId: "other" },
      ],
    },
    "word",
  );
  expect(events).toHaveLength(3);
});
test("missing review dates stay missing and unrelated production evidence remains visible", () => {
  const events = vocabularyLearningTimeline(
    {
      vocabularyReviews: [{ ...review, occurredAt: null }],
      vocabularyEvidence: [
        {
          ...evidence("spelling", "production:attempt"),
          dimension: "usage",
          mode: "production",
          result: "pending",
        },
      ],
    },
    "word",
  );
  expect(events.find((event) => event.id === review.id)?.occurredAt).toBe(null);
  expect(
    events.find((event) => event.id === "production:attempt")?.result,
  ).toBe("pending");
});
