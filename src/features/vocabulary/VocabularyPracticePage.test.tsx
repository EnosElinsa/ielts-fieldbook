import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VocabularyPracticePage } from "./VocabularyPracticePage";
import { getVocabularyReviewQueue } from "../../domain/vocabulary";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";

const { fb, player, owner } = vi.hoisted(() => ({
  fb: { current: null as any },
  player: { play: vi.fn(), stop: vi.fn() },
  owner: { current: "account-one" as string | null },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => fb.current,
}));
vi.mock("../../storage/remote", () => ({ accountId: () => owner.current }));
vi.mock("./playback", () => ({ createVocabularyPlayback: () => player }));
vi.mock("./VocabularyPages", () => ({
  VocabularyNavigation: () => <nav aria-label="Vocabulary views" />,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  owner.current = "account-one";
  player.play.mockReset().mockResolvedValue({ ok: true, source: "speech" });
  player.stop.mockReset();
  const vocabulary = ["resilient", "sustainable"].map((term, index) => ({
    id: `entry-${index}`,
    term,
    category: "word",
    tags: [],
    sources: [{ type: "personal", id: "personal" }],
    senses: [
      {
        id: `sense-${index}`,
        definition: `Definition ${index}`,
        example: `A ${term} community.`,
        pos: "adjective",
      },
    ],
    meaning: `Definition ${index}`,
    example: `A ${term} community.`,
    createdAt: "2020-01-01",
    updatedAt: "2020-01-01",
  }));
  const state = {
    vocabulary,
    vocabularyStates: [],
    vocabularyReviews: [],
    vocabularyEvidence: [],
    vocabularySessions: [],
    vocabularyActivities: [],
    wordbookProgress: [],
    wordbookEnrollments: [],
    settings: {},
  };
  fb.current = {
    state,
    stateRef: { current: state },
    toast: vi.fn(),
    persistNow: vi.fn(async () => true),
    saveVocabularyPreferences: vi.fn(async () => true),
    persistVocabularySession: vi.fn(async () => true),
  };
});
const originalCatalog = { books: [...VOCABULARY_CATALOG.books], units: [...VOCABULARY_CATALOG.units], entries: [...VOCABULARY_CATALOG.entries], memberships: [...VOCABULARY_CATALOG.memberships] };
afterEach(() => { cleanup(); Object.assign(VOCABULARY_CATALOG, originalCatalog); });
function groupFixture(count: number) {
  const vocabulary = Array.from({ length: count }, (_, index) => ({
    ...fb.current.state.vocabulary[0], id: `group-entry-${index}`, term: `word${index}`,
    senses: [{ ...fb.current.state.vocabulary[0].senses[0], id: `group-sense-${index}` }],
    sources: [{ type: 'wordbook', id: `source-${index}`, bookId: 'test-book', unitId: 'test-group' }],
  }));
  fb.current.state.vocabulary = [...vocabulary].reverse();
  fb.current.loadVocabularyCatalog = vi.fn(async () => true);
  VOCABULARY_CATALOG.books = [...originalCatalog.books, { id: 'test-book', title: 'Test book', contentStatus: 'complete' } as any];
  VOCABULARY_CATALOG.units = [...originalCatalog.units, { id: 'test-chapter', bookId: 'test-book', title: 'Natural geography', kind: 'chapter' }, { id: 'test-group', bookId: 'test-book', title: 'Group 1', parentId: 'test-chapter', kind: 'group', contentStatus: 'complete', totalSourceWords: count } as any];
  VOCABULARY_CATALOG.entries = [...originalCatalog.entries, ...vocabulary];
  VOCABULARY_CATALOG.memberships = [...originalCatalog.memberships, ...vocabulary.map((entry, order) => ({ id: `membership-${order}`, entryId: entry.id, bookId: 'test-book', unitId: 'test-group', order })) as any];
}

test("whole group uses all 55 words in source order and preserves answers across pages and recovery", async () => {
  const user = userEvent.setup();
  groupFixture(55);
  const view = mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Session size' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(50);
  await waitFor(() => expect(player.play).toHaveBeenCalledWith(expect.objectContaining({ term: 'word0' }), expect.anything()));
  await user.click(screen.getByRole('textbox', { name: 'Answer 1' }));
  await user.paste('river 2');
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(5);
  await user.click(screen.getByRole('textbox', { name: 'Answer 51' }));
  await user.paste('word50');
  await user.click(screen.getByRole('button', { name: 'Exit session' }));
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  view.unmount();
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await user.click(screen.getByRole('button', { name: 'Resume session' }));
  expect(screen.getByRole('textbox', { name: 'Answer 51' })).toHaveValue('word50');
  await user.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('river 2');
});

test("235-word group submits one frozen full-group attempt beyond the old cap", async () => {
  const user = userEvent.setup();
  groupFixture(235);
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
  expect(fb.current.persistVocabularySession).toHaveBeenCalledTimes(1);
  const [prepared] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularyReviews).toHaveLength(235);
  expect(prepared.vocabularySessions[0].selection).toEqual({ kind: 'unit', bookId: 'test-book', unitId: 'test-group' });
});

test("dictation shortcuts navigate without stealing answer text and pause with Escape", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  const first = screen.getByRole("textbox", { name: "Answer 1" });
  await user.type(first, "river 2");
  expect(first).toHaveValue("river 2");
  fireEvent.keyDown(first, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Answer 2" })).toHaveFocus());
  const second = screen.getByRole("textbox", { name: "Answer 2" });
  player.play.mockClear();
  fireEvent.keyDown(second, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(player.play).toHaveBeenCalled());
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: "ArrowUp", isComposing: true });
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: "Escape" });
  expect(screen.getByRole("dialog")).toHaveTextContent("Keep");
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("production textarea retains multiline editing on Enter and arrows", async () => {
  const user = userEvent.setup();
  mount("?mode=production");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  const first = screen.getByRole("textbox", { name: "Answer 1" });
  await user.type(first, "A river.{enter}Second line");
  expect(first).toHaveValue("A river.\nSecond line");
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(first).toHaveFocus();
});

test("self-review selects retain their native arrow-key interaction", async () => {
  const user = userEvent.setup();
  mount('?mode=production');
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.type(screen.getByRole('textbox', { name: 'Answer 1' }), 'A resilient community.');
  const rating = screen.getByRole('combobox', { name: 'Self review 1' });
  rating.focus();
  const prevented = !fireEvent.keyDown(rating, { key: 'ArrowDown', cancelable: true });
  expect(prevented).toBe(false);
  await waitFor(() => expect(rating).toHaveFocus());
});

test("distinction choice focus targets the correct word and preserves radio navigation", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary.forEach((entry: any) => { entry.senses[0].distinctionTask = { prompt: 'Choose a synonym', options: ['A', 'B'], answer: 'A', explanation: 'A is correct.' }; });
  mount('?mode=distinction');
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  const radio = screen.getAllByRole('radio')[2];
  await user.click(radio);
  expect(fireEvent.keyDown(radio, { key: 'ArrowDown', cancelable: true })).toBe(true);
  player.play.mockClear();
  fireEvent.keyDown(radio, { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ term: 'sustainable' }), expect.anything()));
});

test("result filters preserve marked rows and mistake retry ignores the review batch size", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { sessionSize: 1 };
  groupFixture(55);
  mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.click(screen.getByRole('button', { name: 'Flag word 1' }));
  await user.click(screen.getByRole('button', { name: 'Submit session' }));
  await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
  await user.click(screen.getByRole('button', { name: 'Result filter' }));
  await user.click(screen.getByRole('option', { name: 'Flagged' }));
  expect(screen.getAllByRole('row')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Retry mistakes' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(50);
  expect(screen.getByText('1–50 of 55')).toBeInTheDocument();
});
function mount(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/vocabulary/review${query}`]}>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
}

test("dictation rows conceal answers and autoplay on start and row focus", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  expect(view.container.innerHTML).not.toContain("resilient");
  expect(view.container.innerHTML).not.toContain("sustainable");
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  await waitFor(() =>
    expect(player.play).toHaveBeenCalledWith(
      expect.objectContaining({ term: "resilient" }),
      expect.objectContaining({ accent: "uk" }),
    ),
  );
  await user.click(screen.getByRole("textbox", { name: "Answer 2" }));
  await waitFor(() =>
    expect(player.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ term: "sustainable" }),
      expect.anything(),
    ),
  );
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("submits the complete attempt once and retries the same frozen commit after save failure", async () => {
  const user = userEvent.setup();
  fb.current.persistVocabularySession
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(screen.getByRole("textbox", { name: "Answer 2" }), "wrong");
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  const [prepared, id] = fb.current.persistVocabularySession.mock.calls[0];
  expect(prepared.vocabularyReviews).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Retry submission" }));
  expect(fb.current.persistVocabularySession.mock.calls[1]).toEqual([
    prepared,
    id,
  ]);
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("Session complete")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry mistakes" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  expect(fb.current.persistVocabularySession.mock.calls[2][1]).not.toEqual(id);
});

test("keeps responses locally when exiting and resumes without persisting a review", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "my response",
  );
  await user.click(screen.getByRole("button", { name: "Exit session" }));
  await user.click(screen.getByRole("button", { name: "Keep progress" }));
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume session" }));
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toHaveValue(
    "my response",
  );
});

test("confirms unanswered cards before submitting and keeps production pending", async () => {
  const user = userEvent.setup();
  mount("?mode=production");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "A resilient community recovered.",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  expect(
    screen.getByRole("dialog", { name: "Submit incomplete session" }),
  ).toHaveTextContent("1 unanswered");
  await user.click(screen.getByRole("button", { name: "Submit anyway" }));
  expect(
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularyReviews.map(
      (review: any) => review.result,
    ),
  ).toEqual(["pending", "failure"]);
  expect(screen.getByText("Pending", { selector: "dt" })).toBeInTheDocument();
});

test("focus layout moves with Enter and stops playback on unmount", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { layout: "cards" };
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient{Enter}",
  );
  expect(screen.getByRole("textbox", { name: "Answer 2" })).toBeInTheDocument();
  view.unmount();
  expect(player.stop).toHaveBeenCalled();
});

test("settings save account preferences without changing the active feedback snapshot", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.click(screen.getByRole("button", { name: "Practice settings" }));
  expect(screen.getByRole("combobox", { name: "Feedback" })).toBeDisabled();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Accent" }),
    "us",
  );
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(fb.current.saveVocabularyPreferences.mock.calls[0][0].accent).toEqual(
    "us",
  );
});

test("clears the old owner session and cancels playback when the account changes", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "old account response",
  );
  owner.current = "account-two";
  fb.current.state = { ...fb.current.state };
  view.rerender(
    <MemoryRouter>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Start session" }),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("fixtures create eligible cards for each objective review", () => {
  expect(
    getVocabularyReviewQueue(fb.current.state, { mode: "dictation" }),
  ).toHaveLength(2);
});

test("immediate feedback is local and locks an answer only after leaving the row", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = { feedback: "immediate" };
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(screen.getByRole("textbox", { name: "Answer 1" }), "wrong");
  expect(screen.queryByText("Incorrect")).not.toBeInTheDocument();
  await user.click(screen.getByRole("textbox", { name: "Answer 2" }));
  expect(screen.getByText("Incorrect")).toBeInTheDocument();
  expect(
    screen.getByText("resilient", { selector: "strong" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toHaveAttribute(
    "readonly",
  );
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test("audio loop records listened words in one batch without mastery reviews", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = {
    audioGapMs: 0,
    audioExamples: false,
  };
  mount("?mode=audio");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Audio loop complete"),
  );
  expect(player.play).toHaveBeenCalledTimes(2);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  const submitted = fb.current.persistVocabularySession.mock.calls[0][0];
  expect(submitted.vocabularyActivities).toHaveLength(2);
  expect(submitted.vocabularyReviews).toHaveLength(0);
  expect(submitted.vocabularySessions[0].summary.listened).toBe(2);
});

test("dictation deduplicates senses and follows the frozen snapshot order", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary[0].senses.push({
    ...fb.current.state.vocabulary[0].senses[0],
    id: "second-sense",
  });
  fb.current.state.settings.vocabulary = { order: "random" };
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  const stored = JSON.parse(
    localStorage.getItem("fieldbook-vocabulary-draft-v1:account-one")!,
  );
  const firstEntry = fb.current.state.vocabulary.find(
    (entry: any) => entry.id === stored.session.cardIds[0].entryId,
  );
  await waitFor(() =>
    expect(player.play).toHaveBeenCalledWith(
      expect.objectContaining({ term: firstEntry.term }),
      expect.anything(),
    ),
  );
  fb.current.state = { ...fb.current.state, vocabulary: [] };
  view.rerender(
    <MemoryRouter>
      <VocabularyPracticePage />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
});

test("blocked automatic audio asks for a gesture and manual replay recovers", async () => {
  const user = userEvent.setup();
  player.play
    .mockResolvedValueOnce({ ok: false, source: "none", reason: "blocked" })
    .mockResolvedValue({ ok: true, source: "speech" });
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Select Play to enable audio",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Replay current word" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Browser voice"),
  );
});

test("a failed submission stays frozen after local recovery and keeps the same timestamp", async () => {
  const user = userEvent.setup();
  fb.current.persistVocabularySession
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Answer 2" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  const timestamp =
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0]
      .submittedAt;
  view.unmount();
  mount();
  await user.click(screen.getByRole("button", { name: "Resume session" }));
  expect(screen.getByRole("textbox", { name: "Answer 1" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry submission" }));
  expect(
    fb.current.persistVocabularySession.mock.calls[1][0].vocabularySessions[0]
      .submittedAt,
  ).toEqual(timestamp);
});

test("pausing an audio loop cancels the between-word delay", async () => {
  const user = userEvent.setup();
  fb.current.state.settings.vocabulary = {
    audioGapMs: 5000,
    audioExamples: false,
  };
  const clearTimer = vi.spyOn(window, "clearTimeout");
  mount("?mode=audio");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await waitFor(() =>
    expect(screen.getByText("1 / 2 listened")).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Pause loop" }));
  expect(clearTimer).toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Audio paused");
  expect(player.play).toHaveBeenCalledTimes(1);
  clearTimer.mockRestore();
});

test("audio sessions respect disabled autoplay and allow manual loop playback", async () => {
  fb.current.state.settings.vocabulary = { autoPlay: false, audioGapMs: 0, audioExamples: false };
  const user = userEvent.setup();
  mount("?mode=audio");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  expect(player.play).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Play loop" }));
  await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
});

test.each(["definition", "cloze"])(
  "%s uses its own prompt and waits for submission to reveal the word",
  async (reviewMode) => {
    const user = userEvent.setup();
    mount(`?mode=${reviewMode}`);
    await user.click(screen.getByRole("button", { name: "Start session" }));
    if (reviewMode === "definition")
      expect(screen.getByText("Definition 0")).toBeInTheDocument();
    else expect(screen.getAllByText("A _____ community.")).toHaveLength(2);
    expect(screen.queryByText("resilient")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Answer 1" }),
      "resilient",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Answer 2" }),
      "sustainable",
    );
    await user.click(screen.getByRole("button", { name: "Submit session" }));
    expect(
      fb.current.persistVocabularySession.mock.calls[0][0].vocabularyReviews.every(
        (review: any) =>
          review.result === "success" && review.mode === reviewMode,
      ),
    ).toBe(true);
  },
);

test("authored distinction choices grade the selected answer and show it in the results", async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary[0].senses[0].distinctionTask = {
    prompt: "Which means able to recover?",
    options: ["fragile", "robust"],
    answer: "robust",
    explanation: "Robust things resist damage.",
  };
  mount("?mode=distinction");
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.click(screen.getByRole("radio", { name: "robust" }));
  expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  const record =
    fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0];
  expect(record.results[0]).toEqual(
    expect.objectContaining({
      expectedAnswer: "robust",
      response: "robust",
      result: "success",
    }),
  );
  expect(screen.getByRole("table")).toHaveTextContent("robust");
});

test("recent history opens a result log without starting a completed attempt", async () => {
  const user = userEvent.setup();
  const view = mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await user.type(
    screen.getByRole("textbox", { name: "Answer 1" }),
    "resilient",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Answer 2" }),
    "sustainable",
  );
  await user.click(screen.getByRole("button", { name: "Submit session" }));
  const persisted = fb.current.persistVocabularySession.mock.calls[0][0];
  fb.current.state = persisted;
  view.unmount();
  mount();
  expect(
    screen.queryByRole("button", { name: "Resume session" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Dictation.*2 words.*2 correct/ }),
  );
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
