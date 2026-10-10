import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  VocabularyReviewPage,
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
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/vocabulary/review?mode=dictation"]}>
      <VocabularyReviewPage />
    </MemoryRouter>,
  );

test("dictation conceals the term until answer reveal and freezes the session queue", async () => {
  const view = mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  expect(screen.queryByText("resilient")).not.toBeInTheDocument();
  expect(screen.queryByText("able to recover")).not.toBeInTheDocument();
  api.queue.mockReturnValue([]);
  view.rerender(
    <MemoryRouter>
      <VocabularyReviewPage />
    </MemoryRouter>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Your answer" }),
    "resilient",
  );
  await user.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText("resilient")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save result" }));
  expect(api.review).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      entryId: "one",
      mode: "dictation",
      result: "success",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Session complete")).toBeInTheDocument();
});

test("a failed review save keeps the card and offers retry instead of advancing", async () => {
  fb.current.persistNow.mockResolvedValue(false);
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.click(screen.getByRole("button", { name: "Reveal answer" }));
  await user.click(screen.getByRole("button", { name: "Save result" }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
  expect(
    screen.queryByRole("button", { name: "Next" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Retry save" }),
  ).toBeInTheDocument();
});

test("sentence production defaults to pending verification with no invented correctness", async () => {
  render(
    <MemoryRouter initialEntries={["/vocabulary/review?mode=production"]}>
      <VocabularyReviewPage />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Your answer" }),
    "The resilient community recovered quickly.",
  );
  await user.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.queryByText("Answer matches")).not.toBeInTheDocument();
  expect(
    screen.getByText("Awaiting feedback. No mastery credit yet."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save result" }));
  expect(api.review).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      mode: "production",
      result: "pending",
      verification: "pending",
      durationMs: expect.any(Number),
    }),
  );
});

test("successful saves persist the next position for a resumed session", async () => {
  const first = api.queue.mock.results[0]?.value?.[0];
  const entry = fb.current.state.vocabulary[0];
  const card = first || {
    id: "one:s1:dictation",
    entryId: "one",
    senseId: "s1",
    entry,
    mode: "dictation",
    dimension: "spelling",
    sources: [],
  };
  api.queue.mockReturnValue([
    card,
    { ...card, id: "second-card", senseId: "s2" },
  ]);
  const view = mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.click(screen.getByRole("button", { name: "Reveal answer" }));
  await user.click(screen.getByRole("button", { name: "Save result" }));
  view.unmount();
  mount();
  expect(
    screen.getByText("Saved session: Dictation | 1/2 complete"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Resume session" }));
  expect(screen.getByText("Dictation | 2/2")).toBeInTheDocument();
});

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

test("audio loop cancels browser speech on exit", async () => {
  const synth = { cancel: vi.fn(), getVoices: () => [], speak: vi.fn() };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  const view = render(
    <MemoryRouter initialEntries={["/vocabulary/review?mode=audio"]}>
      <VocabularyReviewPage />
    </MemoryRouter>,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Start audio loop" }));
  expect(synth.speak).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Pause audio loop" }),
  ).toBeInTheDocument();
  const before = synth.cancel.mock.calls.length;
  view.unmount();
  expect(synth.cancel.mock.calls.length).toBeGreaterThan(before);
  vi.unstubAllGlobals();
});
