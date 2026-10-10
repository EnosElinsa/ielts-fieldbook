import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VocabularyEntryPage, VocabularyPage, VocabularyProgressPage, VocabularyWordbooksPage, VocabularyWrongPage, VocabularyNavigation, VocabularyWordsPage, VocabularyHistoryPage } from "./VocabularyPages";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";

const { fb } = vi.hoisted(() => ({ fb: { current: null as any } }));
vi.mock("../../context/FieldbookContext", () => ({ useFieldbook: () => fb.current }));
vi.mock("../../domain/vocabulary/catalog", () => ({ VOCABULARY_CATALOG: { entries: [], books: [], units: [], memberships: [] } }));

beforeEach(() => {
  const state = { vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], vocabularySessions: [], wordbookProgress: [], wordbookEnrollments: [] };
  fb.current = { state, stateRef: { current: state }, persistNow: vi.fn(async () => true), toast: vi.fn(), openModal: vi.fn() };
  Object.assign(VOCABULARY_CATALOG, { entries: [], books: [], units: [], memberships: [] });
});
afterEach(cleanup);
function fixture() {
  Object.assign(VOCABULARY_CATALOG, {
    books: [{ id: "book", title: "IELTS source book", contentStatus: "available" }],
    units: [
      { id: "chapter", bookId: "book", title: "Travel", kind: "chapter", order: 0 },
      { id: "later", bookId: "book", parentId: "chapter", title: "Group 1", kind: "group", order: 1 },
      { id: "first", bookId: "book", parentId: "chapter", title: "Group 1", kind: "group", order: 0 },
    ],
    memberships: [
      { entryId: "two", bookId: "book", unitId: "first", order: 1 },
      { entryId: "one", bookId: "book", unitId: "first", order: 0 },
      { entryId: "two", bookId: "book", unitId: "later", order: 0 },
      { entryId: "three", bookId: "book", unitId: "later", order: 1 },
    ],
  });
  fb.current.state.vocabulary = ["one", "two", "three"].map(id => ({ id, term: id, meaning: "Meaning", category: "word", tags: [], sources: [{ type: "wordbook", id, bookId: "book", unitId: id === "three" ? "later" : "first" }], senses: [{ id: "sense", definition: "Meaning", example: "An example.", pos: "noun" }], createdAt: "2026-01-01", updatedAt: "2026-01-01" }));
  fb.current.state.wordbookEnrollments = [{ bookId: "book" }];
}
function showBook() {
  return render(<MemoryRouter initialEntries={["/vocabulary/wordbooks?bookId=book"]}><VocabularyWordbooksPage /></MemoryRouter>);
}
function submitted(ids: string[], options: any = {}) {
  return { id: "session", mode: "dictation", status: "submitted", filter: { bookId: "book", unitId: "first", dueOnly: false }, entryIds: ids, results: ids.map(entryId => ({ entryId, response: "an attempt", result: "failure" })), submittedAt: "2026-10-10", ...options };
}

test("pending source hierarchy retains loading failure and never claims zero-word completion", async () => {
  Object.assign(VOCABULARY_CATALOG, { books: [{ id: "book", title: "IELTS source book", contentStatus: "starter" }], units: [{ id: "group", bookId: "book", title: "Group 1", totalSourceWords: 100, contentStatus: "pending" }], memberships: [] });
  fb.current.loadVocabularyCatalog = vi.fn(async () => false);
  showBook();
  expect(await screen.findByText("100 source words | Content pending")).toBeInTheDocument();
  expect(screen.queryByText("Studied 0/0")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Study group/ })).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Retry catalog" })).toBeInTheDocument();
});

test("book continue selects first source group and chapter counts deduplicate descendants", () => {
  fixture(); showBook();
  expect(screen.getByRole("link", { name: /Start first group/ })).toHaveAttribute("href", "/vocabulary/study?bookId=book&unitId=first&dueOnly=false");
  const chapter = screen.getByText("Travel").closest("details")!;
  expect(within(chapter).getByText("3 words · 0/2 groups studied")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Study group/ }).map(link => link.getAttribute("href"))).toEqual([
    "/vocabulary/study?bookId=book&unitId=first&dueOnly=false", "/vocabulary/study?bookId=book&unitId=later&dueOnly=false",
  ]);
  expect(within(chapter).getAllByText("IELTS source book / Travel / Group 1")).toHaveLength(2);
});

test("whole persisted attempts advance continue while imported per-word progress and partial sessions do not", () => {
  fixture();
  fb.current.state.wordbookProgress = [{ bookId: "book", unitId: "first", status: "completed", completedEntryIds: ["one", "two"] }];
  fb.current.state.vocabularySessions = [submitted(["one"])];
  const view = showBook();
  expect(screen.getByRole("link", { name: /Start first group/ })).toHaveAttribute("href", expect.stringContaining("unitId=first"));
  fb.current.state.vocabularySessions = [submitted(["one", "two"])];
  view.rerender(<MemoryRouter initialEntries={["/vocabulary/wordbooks?bookId=book"]}><VocabularyWordbooksPage /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Continue study/ })).toHaveAttribute("href", expect.stringContaining("unitId=later"));
  expect(screen.getByText("3 words · 1/2 groups studied")).toBeInTheDocument();
});

test("blank answers and audio listening do not complete an assessed study group", () => {
  fixture();
  fb.current.state.vocabularySessions = [submitted(["one", "two"], { results: [{ entryId: "one", response: "one" }, { entryId: "two", response: "" }] }), submitted(["one", "two"], { mode: "audio" })];
  showBook();
  expect(screen.getByRole("link", { name: /Start first group/ })).toHaveAttribute("href", expect.stringContaining("unitId=first"));
});

test("overview provides separate wordbook study and vocabulary review entry routes", () => {
  render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Study wordbooks/ })).toHaveAttribute("href", "/vocabulary/wordbooks");
  expect(screen.getByRole("link", { name: /Review vocabulary/ })).toHaveAttribute("href", "/vocabulary/review");
});

test("progress keeps studied coverage separate from mastery and imported history", () => {
  fixture();
  fb.current.state.wordbookProgress = [{ bookId: "book", unitId: "later", completedEntryIds: ["three"], status: "imported-summary" }];
  fb.current.state.vocabularySessions = [submitted(["one", "two"])];
  render(<MemoryRouter><VocabularyProgressPage /></MemoryRouter>);
  expect(screen.getByText("Studied 2/3 words · 1/2 groups")).toBeInTheDocument();
  expect(screen.getByText("Mastered 0/3 words")).toBeInTheDocument();
});


test("explicit unit sessions count answered production without treating pending verification as mastery", () => {
  fixture();
  fb.current.state.vocabularySessions = [submitted(["one", "two"], { mode: "production", filter: {}, selection: { kind: "unit", bookId: "book", unitId: "first" }, results: [{ entryId: "one", response: "A sentence.", result: "pending" }, { entryId: "two", response: "Another sentence.", result: "pending" }] })];
  showBook();
  expect(screen.getByRole("link", { name: /Continue study/ })).toHaveAttribute("href", expect.stringContaining("unitId=later"));
});

test("entry details omit raw source context and retain review history", async () => {
  fixture();
  fb.current.state.vocabulary[0].sources[0].context = "A source passage.";
  const fetchStub = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) } as Response);
  render(<MemoryRouter initialEntries={["/vocabulary/entry/one"]}><Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Practise this word/ })).toHaveAttribute("href", "/vocabulary/review?entryId=one&dueOnly=false");
  expect(screen.queryByText("Source context")).not.toBeInTheDocument();
  expect(screen.queryByText("A source passage.")).not.toBeInTheDocument();
  expect(screen.getByText("Review history").closest("details")).not.toHaveAttribute("open");
  await screen.findByText("No additional dictionary senses available.");
  fetchStub.mockRestore();
});

test("wrong word recovery preserves active source filters in its practice link", () => {
  fixture();
  render(<MemoryRouter><VocabularyWrongPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Wrong word book" }));
  fireEvent.click(screen.getByRole("option", { name: "IELTS source book" }));
  expect(screen.getByRole("link", { name: /Recover wrong words/ })).toHaveAttribute("href", "/vocabulary/review?wrongOnly=true&dueOnly=false&bookId=book");
});

test.each([
  ['/vocabulary/review?sessionId=saved&resultFilter=incorrect', 'Back to session word list'],
  ['https://example.com', 'My vocabulary'],
  ['//example.com/vocabulary/review', 'My vocabulary'],
  ['/vocabulary/review\\evil', 'My vocabulary'],
])('entry return link preserves a safe session context: %s', async (returnTo, title) => {
  fixture();
  const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) } as Response);
  render(<MemoryRouter initialEntries={[`/vocabulary/entry/one?returnTo=${encodeURIComponent(returnTo)}`]}><Routes><Route path="/vocabulary/entry/:id" element={<VocabularyEntryPage />} /></Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: title })).toHaveAttribute('href', title === 'My vocabulary' ? '/vocabulary' : returnTo);
  await screen.findByText('No additional dictionary senses available.');
  fetchStub.mockRestore();
});


test("group study keeps the wordbook navigation entry active", () => {
  render(<MemoryRouter initialEntries={["/vocabulary/study?bookId=book&unitId=first"]}><VocabularyNavigation /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Wordbook study" })).toHaveAttribute("aria-current", "page");
});

test("failed enrollment save offers an actionable error", async () => {
  fixture();
  fb.current.state.wordbookEnrollments = [];
  fb.current.persistNow.mockResolvedValue(false);
  showBook();
  fireEvent.click(screen.getByRole("button", { name: "Add wordbook" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Wordbook could not be saved. Retry adding it.");
});

test("archived state overrides catalog words so a complete remaining group advances continue", () => {
  fixture();
  VOCABULARY_CATALOG.entries = structuredClone(fb.current.state.vocabulary);
  fb.current.state.vocabulary[0].tags = ["archived"];
  fb.current.state.vocabularySessions = [submitted(["two"])];
  showBook();
  expect(screen.getByRole("link", { name: /Continue study/ })).toHaveAttribute("href", expect.stringContaining("unitId=later"));
  expect(screen.getByText("1 archived word excluded from study")).toBeInTheDocument();
  expect(screen.getByText("3 words · 1/2 groups studied")).toBeInTheDocument();
  cleanup();
  render(<MemoryRouter><VocabularyProgressPage /></MemoryRouter>);
  expect(screen.getByText("Studied 1/3 words · 1/2 groups")).toBeInTheDocument();
});

test("entirely archived groups are excluded from continue rather than marked studied", () => {
  fixture();
  fb.current.state.vocabulary[0].tags = ["archived"];
  fb.current.state.vocabulary[1].tags = ["archived"];
  fb.current.state.vocabularySessions = [submitted(["one", "two"])];
  showBook();
  expect(screen.getByRole("link", { name: /Start first group/ })).toHaveAttribute("href", expect.stringContaining("unitId=later"));
  expect(screen.getByText("2 words · Archived · Excluded from study")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Study group/ })).toHaveLength(1);
  expect(screen.getByText("0/1 available groups studied")).toBeInTheDocument();
});

test("catalog archived fallback is excluded but mode-ineligible nonarchived words still require an attempt", () => {
  fixture();
  VOCABULARY_CATALOG.entries = [structuredClone(fb.current.state.vocabulary[0])];
  VOCABULARY_CATALOG.entries[0].tags = ["archived"];
  fb.current.state.vocabulary = fb.current.state.vocabulary.slice(1);
  fb.current.state.vocabularySessions = [submitted(["two"])];
  const view = showBook();
  expect(screen.getByRole("link", { name: /Continue study/ })).toHaveAttribute("href", expect.stringContaining("unitId=later"));
  // Restoring a nonarchived word with no task for the selected mode must not silently complete it.
  fb.current.state.vocabulary.push({ ...VOCABULARY_CATALOG.entries[0], tags: [], senses: [] });
  view.rerender(<MemoryRouter initialEntries={["/vocabulary/wordbooks?bookId=book"]}><VocabularyWordbooksPage /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Start first group/ })).toHaveAttribute("href", expect.stringContaining("unitId=first"));
});

test("an all-archived book has no study continuation or vacuous completion claim", () => {
  fixture();
  fb.current.state.vocabulary.forEach((entry: any) => { entry.tags = ["archived"]; });
  fb.current.state.vocabularySessions = [submitted(["one", "two", "three"])];
  showBook();
  expect(screen.queryByRole("link", { name: /Start first group|Continue study|Study again|Study group|Restudy group|Continue chapter/ })).not.toBeInTheDocument();
  expect(screen.getByText("All available words are archived. Restore a word to study this book.")).toBeInTheDocument();
});


test("reliable historical zero-grade group advances continue", () => {
  fixture(); fb.current.state.wordbookProgress = [{bookId:'book',unitId:'first',sourceRecord:{id:'attempt',correct_rate:'0',book_hierarchy_id:'first'}}];
  showBook(); expect(screen.getByRole('link',{name:/Continue study/})).toHaveAttribute('href',expect.stringContaining('unitId=later'));
});
test("my words restores searchable route filters without overview entryways", () => {
  fixture(); render(<MemoryRouter initialEntries={['/vocabulary/words?search=one']}><VocabularyWordsPage /></MemoryRouter>);
  expect(screen.getByRole('heading',{name:'My words'})).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:/Study wordbooks/})).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'one'})).toHaveAttribute('href',expect.stringContaining('returnTo='));
});
test("history links submitted sessions to independent result routes", () => {
  fixture(); fb.current.state.vocabularySessions=[submitted(['one'])];
  render(<MemoryRouter><VocabularyHistoryPage/></MemoryRouter>);
  expect(screen.getByRole('link',{name:/Dictation/})).toHaveAttribute('href','/vocabulary/history/session');
});
