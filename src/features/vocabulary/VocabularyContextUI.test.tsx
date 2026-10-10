import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { VocabularyGroupWordsPage } from "./VocabularyGroupWordsPage";
import { VocabularyEntryPage } from "./VocabularyEntryPage";
import { VocabularyPracticeResults } from "./VocabularyPracticeResults";
import { VocabularyNavigation } from "./VocabularyPages";
import { resetDictionaryCache } from "./DictionarySenses";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { resolveVocabularyLearningContext } from "../../domain/vocabulary/context";
import { normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
const mocks = vi.hoisted(() => ({
  fb: null as any,
  player: { play: vi.fn(), stop: vi.fn() },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => mocks.fb,
}));
vi.mock("./playback", () => ({ createVocabularyPlayback: () => mocks.player }));
vi.mock("../../domain/vocabulary/media", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getVocabularyMedia: vi.fn(async () => ({
    recordings: [
      {
        url: "https://example.test/core.ogg",
        title: "Core recording",
        accent: "us",
        status: "verified",
        availability: "http-audio",
        wordformConfirmed: true,
        sourceUrl: "https://example.test/recording",
        author: "Recording author",
        license: "CC-BY-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        changes: "No edits.",
      },
    ],
  })),
}));
const original = structuredClone(VOCABULARY_CATALOG);
const release = JSON.parse(
  readFileSync("public/vocabulary-catalog.json", "utf8"),
);
beforeEach(() => {
  Object.assign(VOCABULARY_CATALOG, structuredClone(release));
  const state = {
    vocabulary: [],
    vocabularyStates: [],
    vocabularyReviews: [],
    vocabularyEvidence: [],
    vocabularyActivities: [],
    vocabularySessions: [],
    vocabularyImportBatches: [],
    wordbookEnrollments: [],
    wordbookProgress: [],
    settings: {},
  };
  mocks.fb = {
    state,
    stateRef: { current: state },
    loadVocabularyCatalog: vi.fn(async () => true),
    persistNow: vi.fn(),
    toast: vi.fn(),
    openModal: vi.fn(),
  };
  mocks.player.play.mockReset().mockResolvedValue({
    ok: true,
    source: "speech",
    accent: "uk",
    voice: "Test UK voice",
  });
  mocks.player.stop.mockReset();
  resetDictionaryCache();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ entries: [] }) })),
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  Object.assign(VOCABULARY_CATALOG, structuredClone(original));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname + location.search}
    </output>
  );
}
function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/vocabulary/wordbooks/:bookId/groups/:unitId/words"
          element={<VocabularyGroupWordsPage />}
        />
        <Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}
const book = "guixue:10174";
const core = () => release.entries.find((entry: any) => entry.term === "core");
test("group browsing works before enrollment, deduplicates source order, includes archived, and play creates no learning writes", async () => {
  const raw = core();
  mocks.fb.state.vocabulary = [{ ...structuredClone(raw), tags: ["archived"] }];
  const before = JSON.stringify(mocks.fb.state);
  mount(`/vocabulary/wordbooks/${book}/groups/21795/words`);
  await screen.findByRole("heading", { name: "Group 1 words" });
  expect(
    screen.getByText("55 unique words · Original source order"),
  ).toBeInTheDocument();
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(51);
  expect(rows[1]).toHaveTextContent("1");
  expect(
    within(rows.find((row) => row.textContent?.includes("core"))!).getByText(
      "Archived",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Study group/ })).toHaveAttribute(
    "href",
    `/vocabulary/study?bookId=${encodeURIComponent(book)}&unitId=21795&dueOnly=false`,
  );
  await userEvent
    .setup()
    .click(screen.getAllByRole("button", { name: /Play UK pronunciation/ })[0]);
  expect(mocks.player.play).toHaveBeenCalledOnce();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("235-group search and 50 pagination preserve original indexes and full study selection", async () => {
  mount("/vocabulary/wordbooks/guixue:11320/groups/35028/words?page=4");
  await screen.findByRole("heading", { name: "Group 12 words" });
  expect(screen.getByText("201–235 of 235 · 50 per page")).toBeInTheDocument();
  const first = screen.getAllByRole("row")[1];
  expect(within(first).getByText("201")).toBeInTheDocument();
  const term = first.querySelector("a")!.textContent!;
  await userEvent
    .setup()
    .type(screen.getByRole("textbox", { name: "Search group words" }), term);
  expect(screen.getByLabelText("Current route")).toHaveTextContent("search=");
  expect(screen.getByLabelText("Current route")).not.toHaveTextContent(
    "page=4",
  );
  expect(screen.getByRole("link", { name: /Study group/ })).toHaveAttribute(
    "href",
    "/vocabulary/study?bookId=guixue%3A11320&unitId=35028&dueOnly=false",
  );
  expect(
    screen.getAllByRole("row").some((row) => row.textContent?.includes("201")),
  ).toBe(true);
});
test("detail uses distinct confirmed core group content, one bottom credits collection, and the exact origin drill", async () => {
  const raw = core();
  const resolved = resolveVocabularyLearningContext(raw, {
    bookId: book,
    unitId: "21840",
  });
  const origin = `/vocabulary/entry/${raw.id}?bookId=${encodeURIComponent(book)}&unitId=21840&returnTo=${encodeURIComponent(`/vocabulary/wordbooks/${book}/groups/21840/words?search=core&page=0`)}`;
  mount(origin);
  expect(
    screen.getByRole("heading", { name: "Meaning in this group" }),
  ).toBeInTheDocument();
  expect(screen.getByText(resolved.sense!.definition)).toBeInTheDocument();
  const practice = new URL(
    screen
      .getByRole("link", { name: /Practise this word/ })
      .getAttribute("href")!,
    "https://test.test",
  );
  expect(practice.searchParams.get("senseId")).toBe(
    "editorial:core:fruit-centre",
  );
  expect(practice.searchParams.get("unitId")).toBe("21840");
  expect(practice.searchParams.get("returnTo")).toBe(origin);
  expect(screen.getByRole("link", { name: "Image credits" })).toHaveAttribute(
    "href",
    "#vocabulary-sources",
  );
  expect(screen.getByAltText(/apple|fruit/i)).toBeInTheDocument();
  await screen.findByText("Recording author");
  expect(screen.getAllByText("Sources & licenses")).toHaveLength(1);
  expect(
    screen.getByText("Sources & licenses").closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getByText("Other learning meanings · 1").closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.queryByText("Sense 1")).not.toBeInTheDocument();
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("unconfirmed group keeps common meaning heading and explicit confirmation note", async () => {
  const raw = release.entries.find((entry: any) => entry.term === "cashier");
  mount(`/vocabulary/entry/${raw.id}?bookId=guixue%3A11320&unitId=35003`);
  await screen.findByText(
    "Group meaning not confirmed. This is the current common meaning.",
  );
  expect(
    screen.getByRole("heading", { name: "Common meaning" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Meaning in this group" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
test("detail back preserves list filters and focus across real route navigation", async () => {
  const view = mount(
    `/vocabulary/wordbooks/${book}/groups/21840/words?search=core`,
  );
  await screen.findByRole("heading", { name: "Group 2 words" });
  const coreLink = screen.getByRole("link", { name: "core" });
  await userEvent.setup().click(coreLink);
  expect(screen.getByRole("heading", { name: "core" })).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("link", { name: "Back to group words" }));
  await screen.findByRole("heading", { name: "Group 2 words" });
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "core" })).toHaveFocus(),
  );
  expect(
    screen.getByRole("textbox", { name: "Search group words" }),
  ).toHaveValue("core");
  view.unmount();
});
test("browse distinguishes load error, retry and invalid group", async () => {
  mocks.fb.loadVocabularyCatalog.mockRejectedValueOnce(new Error("offline"));
  mount(`/vocabulary/wordbooks/${book}/groups/missing/words`);
  expect(screen.getByText("Loading group words…")).toHaveAttribute(
    "role",
    "status",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry group" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "group is unavailable",
  );
});
function resultsFixture(mode = "dictation") {
  const raw = core();
  const row = {
    cardId: "core-card",
    entryId: raw.id,
    senseId: raw.senses[0].id,
    term: "core",
    response: "cor",
    expectedAnswer: "core",
    result: "failure",
    definition: "An old definition.",
    example: "Old example.",
  };
  return {
    id: "old-session",
    mode,
    status: "submitted",
    startedAt: "2025-01-01",
    submittedAt: "2025-01-01",
    preferences: normalizeVocabularyPreferences({}),
    filter: { bookId: book, unitId: "21840" },
    selection: { kind: "unit", bookId: book, unitId: "21840" },
    results: [row],
    summary: { correct: 0, incorrect: 1, total: 1, pending: 0 },
    entryIds: [raw.id],
    reviewIds: [],
    updatedAt: "2025-01-01",
  } as any;
}
function showResults(results: any) {
  const controller = {
    state: mocks.fb.state,
    resultFilter: "all",
    resultRows: results.results,
    setResultFilter: vi.fn(),
    resetResults: vi.fn(),
    retryMistakes: vi.fn(),
    resultReturnTo: "/vocabulary/history/old-session?resultFilter=incorrect",
    preferences: normalizeVocabularyPreferences({ accent: "us" }),
  };
  return render(
    <MemoryRouter>
      <VocabularyPracticeResults
        controller={controller as any}
        results={results}
      />
    </MemoryRouter>,
  );
}
test("historical dictation shows current group reference but frozen score and grading stay immutable", async () => {
  const results = resultsFixture();
  const before = JSON.stringify(results);
  showResults(results);
  expect(
    screen.getByText(/Current learning reference updated/),
  ).toBeInTheDocument();
  expect(screen.getByText(/fruit.*seeds/i)).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "0 of 1 correct" }),
  ).toBeInTheDocument();
  const details = new URL(
    screen.getByRole("link", { name: "Details" }).getAttribute("href")!,
    "https://test.test",
  );
  expect(details.searchParams.get("senseId")).toBe(
    "editorial:core:fruit-centre",
  );
  expect(details.searchParams.get("unitId")).toBe("21840");
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Play US pronunciation of core" }),
    );
  expect(mocks.player.play).toHaveBeenCalledWith(
    expect.objectContaining({ term: "core" }),
    expect.objectContaining({ accent: "us" }),
  );
  expect(JSON.stringify(results)).toBe(before);
  expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});
test("non-dictation preserves frozen prompt and adds current definition separately with no production diff", () => {
  const results = resultsFixture("production");
  results.results[0].prompt = "The original question.";
  showResults(results);
  expect(screen.getByText("An old definition.")).toBeInTheDocument();
  expect(screen.getByText("The original question.")).toBeInTheDocument();
  expect(screen.getByText(/Current meaning:/)).toBeInTheDocument();
  expect(document.querySelector(".practice-answer-difference")).toBeNull();
  const details = new URL(
    screen.getByRole("link", { name: "Details" }).getAttribute("href")!,
    "https://test.test",
  );
  expect(details.searchParams.get("senseId")).toBe(core().senses[0].id);
});
test("wordbook navigation stays active on direct group browsing route", () => {
  render(
    <MemoryRouter
      initialEntries={["/vocabulary/wordbooks/guixue:10174/groups/21795/words"]}
    >
      <VocabularyNavigation />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Wordbooks" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
test("edited learner notes remain visible as notes without a context-reviewed heading or image", () => {
  const raw = structuredClone(core());
  const resolved = resolveVocabularyLearningContext(raw, {
    bookId: book,
    unitId: "21795",
  });
  raw.senses = [
    {
      ...resolved.sense!,
      usage: "My geology note.",
      collocations: ["my own core phrase"],
      synonyms: ["my synonym note"],
    },
  ];
  mocks.fb.state.vocabulary = [raw];
  mount(`/vocabulary/entry/${raw.id}?bookId=guixue%3A10174&unitId=21795`);
  expect(
    screen.getByRole("heading", { name: "Common meaning" }),
  ).toBeInTheDocument();
  expect(screen.getByText("My geology note.")).toBeInTheDocument();
  expect(screen.getByText("Your collocation notes")).toBeInTheDocument();
  expect(screen.getByText("my own core phrase")).toBeInTheDocument();
  expect(screen.getByText("my synonym note")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
test("a deliberate familiarity save targets the displayed new stable sense without retargeting the original", async () => {
  const raw = structuredClone(core());
  mocks.fb.state.vocabulary = [raw];
  mocks.fb.persistNow.mockResolvedValue(true);
  mount(`/vocabulary/entry/${raw.id}?bookId=guixue%3A10174&unitId=21840`);
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Familiarity for this meaning" }),
    );
  await userEvent
    .setup()
    .click(screen.getByRole("option", { name: "Familiar" }));
  const saved = mocks.fb.persistNow.mock.calls[0][0];
  expect(
    saved.vocabularyStates.find((row: any) => row.manualStatus === "familiar")
      .senseId,
  ).toBe("editorial:core:fruit-centre");
  expect(
    saved.vocabulary[0].senses.some(
      (sense: any) => sense.id === raw.senses[0].id,
    ),
  ).toBe(true);
  expect(saved.vocabularyReviews).toHaveLength(0);
});
