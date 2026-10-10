import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  VocabularyWordbooksPage,
} from "./VocabularyPages";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";

const { fb, api } = vi.hoisted(() => ({
  fb: { current: null as any },
  api: { queue: vi.fn(), review: vi.fn() },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => fb.current,
}));
vi.mock("../../domain/vocabulary", () => ({
  getVocabularyReviewQueue: api.queue,
  recordVocabularyReview: api.review,
  addVocabularyItem: vi.fn(),
  updateVocabularyItem: vi.fn(),
  removeVocabularyItem: vi.fn(),
  enrollWordbook: vi.fn(),
  recordVocabularyEvidence: vi.fn(),
  recordAudioActivity: vi.fn(),
  deriveVocabularyStatus: () => "new",
  getActiveWrongWords: () => [],
  resolveWrongWord: vi.fn(),
  setVocabularyManualStatus: vi.fn(),
  markWordbookUnitComplete: vi.fn(),
  normalizeAnswer: (value: string) => value.trim().toLowerCase(),
}));
vi.mock("../../domain/vocabulary/catalog", () => ({
  VOCABULARY_CATALOG: { entries: [], books: [], units: [], memberships: [] },
}));

beforeEach(() => {
  sessionStorage.clear();
  const entry = {
    id: "one",
    term: "resilient",
    meaning: "able to recover",
    example: "A resilient community recovers.",
    sources: [],
    senses: [
      {
        id: "s1",
        definition: "able to recover",
        example: "A resilient community recovers.",
      },
    ],
  };
  const state = {
    vocabulary: [entry],
    vocabularyStates: [],
    vocabularyReviews: [],
    vocabularyActivities: [],
    wordbookProgress: [],
    wordbookEnrollments: [],
  };
  fb.current = {
    state,
    stateRef: { current: state },
    persistNow: vi.fn(async () => true),
    toast: vi.fn(),
  };
  api.queue.mockReturnValue([
    {
      id: "one:s1:dictation",
      entryId: "one",
      senseId: "s1",
      entry,
      mode: "dictation",
      dimension: "spelling",
      sources: [],
    },
  ]);
  api.review.mockReset();
  Object.assign(VOCABULARY_CATALOG, {
    entries: [],
    books: [],
    units: [],
    memberships: [],
  });
});
afterEach(cleanup);
test("pending source hierarchy shows unavailable content without a zero-word completion claim", async () => {
  Object.assign(VOCABULARY_CATALOG, {
    books: [
      {
        id: "book",
        title: "IELTS source book",
        totalSourceWords: 100,
        contentStatus: "starter",
      },
    ],
    units: [
      {
        id: "group",
        bookId: "book",
        title: "Group 1",
        totalSourceWords: 100,
        contentStatus: "pending",
      },
    ],
    memberships: [],
  });
  fb.current.loadVocabularyCatalog = vi.fn(async () => false);
  render(
    <MemoryRouter initialEntries={["/vocabulary/wordbooks?bookId=book"]}>
      <VocabularyWordbooksPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText("100 source words | Content pending"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark studied" })).toBeDisabled();
  expect(screen.queryByText("Studied 0/0")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Study unit" }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Retry catalog" }),
  ).toBeInTheDocument();
});
