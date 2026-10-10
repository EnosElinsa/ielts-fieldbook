import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from 'react';
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link, useLocation, useNavigate, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VocabularyPracticePage } from "./VocabularyPracticePage";
import { getVocabularyReviewQueue } from "../../domain/vocabulary";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';
import { createVocabularySession, evaluateVocabularySessionAnswer } from '../../domain/vocabulary/session';

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
  player.play.mockReset().mockResolvedValue({ ok: true, source: "speech", accent: "uk", voice: "Test UK voice" });
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
    vocabularyEvidence: vocabulary.map(entry => ({entryId:entry.id,mode:'dictation',verification:'objective',result:'success'})),
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
}, 15_000);

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

test("catalog-only draft recovery waits for the saved book and retains answers when loading fails", async () => {
  const user = userEvent.setup();
  groupFixture(235);
  const savedCatalog = { ...VOCABULARY_CATALOG };
  const view = mount('?bookId=test-book&unitId=test-group&dueOnly=false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.click(screen.getByRole('textbox', { name: 'Answer 1' }));
  await user.paste('saved-answer');
  await user.click(screen.getByRole('button', { name: 'Exit session' }));
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  view.unmount();
  fb.current.state.vocabulary = [];
  Object.assign(VOCABULARY_CATALOG, originalCatalog);
  fb.current.loadVocabularyCatalog.mockRejectedValue(new Error('offline'));
  mount();
  await user.click(screen.getByRole('button', { name: 'Resume session' }));
  expect(screen.getByText(/The saved wordbook could not be loaded/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resume session' })).toBeEnabled();
  let release: () => void;
  fb.current.loadVocabularyCatalog.mockImplementationOnce(() => new Promise<void>(resolve => {
    release = () => { Object.assign(VOCABULARY_CATALOG, savedCatalog); resolve(); };
  }));
  await user.click(screen.getByRole('button', { name: 'Resume session' }));
  expect(screen.getByRole('button', { name: 'Loading session…' })).toBeDisabled();
  expect(fb.current.loadVocabularyCatalog).toHaveBeenLastCalledWith('test-book');
  release!();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('saved-answer'));
  expect(screen.getByText('1–50 of 235')).toBeInTheDocument();
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
  expect(screen.getByRole('heading', {name: '1 of 2 correct'})).toBeInTheDocument();
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
    .mockResolvedValue({ ok: true, source: "speech", accent: "uk", voice: "Test UK voice" });
  mount();
  await user.click(screen.getByRole("button", { name: "Start session" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Select Play to enable audio",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Replay current word" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("UK device voice: Test UK voice"),
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
  const detail = screen.getAllByRole('link', { name: /Details/ })[0];
  const href = detail.getAttribute('href')!;
  const returnTo = new URL(href, 'https://fieldbook.test').searchParams.get('returnTo')!;
  expect(returnTo).toContain(`sessionId=${persisted.vocabularySessions[0].id}`);
  cleanup();
  mount(returnTo.slice(returnTo.indexOf('?')) + '&resultFilter=flagged');
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByText('No results in this view.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'New session' }));
  expect(await screen.findByRole('button', { name: 'Start session' })).toBeInTheDocument();
});

function CurrentRoute(){return <output>{useLocation().pathname}</output>}
function ImperativeNavigation() {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  return <>
    <button onClick={() => navigateWithPracticeGuard('/account', () => navigate('/account'))}>Account menu route</button>
    <button onClick={() => navigateWithPracticeGuard('/write', () => { fb.current.setSkill('writing', '/write'); navigate('/write'); })}>Command search route</button>
    <button onClick={() => setMoreOpen(true)}>Open More</button>
    {moreOpen ? <div role="dialog" aria-label="More navigation"><button onClick={() => { setMoreOpen(false); navigateWithPracticeGuard('/progress', () => navigate('/progress')); }}>Progress from More</button></div> : null}
  </>;
}
test('imperative account and command navigation wait for the active session decision', async () => {
  const user = userEvent.setup();
  fb.current.setSkill = vi.fn();
  render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><ImperativeNavigation /><VocabularyPracticePage /><CurrentRoute /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.click(screen.getByRole('button', { name: 'Account menu route' }));
  expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Command search route' }));
  expect(fb.current.setSkill).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  expect(fb.current.setSkill).toHaveBeenCalledWith('writing', '/write');
  expect(screen.getByText('/write')).toBeInTheDocument();
});

test('More closes before the practice departure decision', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><ImperativeNavigation /><VocabularyPracticePage /><CurrentRoute /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start session' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Start session' }));
  await user.click(screen.getByRole('button', { name: 'Open More' }));
  await user.click(screen.getByRole('button', { name: 'Progress from More' }));
  expect(screen.queryByRole('dialog', { name: 'More navigation' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Exit practice session' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep progress' }));
  expect(screen.getByText('/progress')).toBeInTheDocument();
});
test('active internal navigation lets learners cancel or keep their draft before departure',async()=>{
const user=userEvent.setup();render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><Link to='/vocabulary/words'>Leave for words</Link><VocabularyPracticePage/><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'Start session'}));
await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'my answer');await user.click(screen.getByRole('link',{name:'Leave for words'}));
expect(screen.getByRole('dialog',{name:'Exit practice session'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
await user.click(screen.getByRole('link',{name:'Leave for words'}));await user.click(screen.getByRole('button',{name:'Keep progress'}));expect(screen.getByText('/vocabulary/words')).toBeInTheDocument();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('submitted group stays on history across refresh and word-detail return',async()=>{
const user=userEvent.setup();groupFixture(2);fb.current.state.settings={vocabulary:{mode:'production'}};
const view=render(<MemoryRouter initialEntries={['/vocabulary/study?bookId=test-book&unitId=test-group&dueOnly=false']}><Routes><Route path='/vocabulary/study' element={<VocabularyPracticePage/>}/><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());expect(screen.getByRole('button',{name:'Review mode'})).toHaveTextContent('Dictation');await user.click(screen.getByRole('button',{name:'Start session'}));await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'word0');await user.type(screen.getByRole('textbox',{name:'Answer 2'}),'word1');await user.click(screen.getByRole('button',{name:'Submit session'}));
const state=fb.current.persistVocabularySession.mock.calls[0][0];const id=state.vocabularySessions[0].id;expect(await screen.findByRole('table')).toBeInTheDocument();expect(await screen.findByText(`/vocabulary/history/${id}`)).toBeInTheDocument();
const returnTo=new URL(screen.getAllByRole('link',{name:/Details/})[0].getAttribute('href')!,'https://test.test').searchParams.get('returnTo')!;expect(returnTo).toContain(`/vocabulary/history/${id}`);expect(returnTo).toContain('bookId=test-book');view.unmount();fb.current.state=state;
render(<MemoryRouter initialEntries={[returnTo]}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes><CurrentRoute/></MemoryRouter>);expect(await screen.findByRole('table')).toBeInTheDocument();expect(await screen.findByText(`/vocabulary/history/${id}`)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Start session'})).not.toBeInTheDocument();
});

test('mobile More dialog links still protect an active vocabulary draft',async()=>{
const user=userEvent.setup();render(<MemoryRouter initialEntries={['/vocabulary/review?dueOnly=false']}><div role='dialog' aria-label='More navigation'><Link to='/vocabulary/words'>My words from More</Link></div><VocabularyPracticePage/><CurrentRoute/></MemoryRouter>);
await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());await user.click(screen.getByRole('button',{name:'Start session'}));await user.click(screen.getByRole('link',{name:'My words from More'}));expect(screen.getByRole('dialog',{name:'Exit practice session'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByText('/vocabulary/review')).toBeInTheDocument();
});

test('legacy identity-only distinction draft keeps the old accepted synonym', async () => {
 const user=userEvent.setup();const entry=fb.current.state.vocabulary[0];
 entry.term='affect';entry.senses[0].synonyms=['influence'];entry.senses[0].distinctions=['Affect is a verb.'];
 const now=new Date().toISOString();
 localStorage.setItem('fieldbook-vocabulary-draft-v1:account-one',JSON.stringify({version:1,savedAt:now,session:{id:'legacy-distinction',mode:'distinction',status:'paused',startedAt:now,index:0,preferences:{},filter:{},cardIds:[{id:`${entry.id}:${entry.senses[0].id}:distinction`,entryId:entry.id,senseId:entry.senses[0].id,mode:'distinction'}],answers:{}}}));
 mount('?mode=distinction');await user.click(await screen.findByRole('button',{name:'Resume session'}));
 await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'influence');
 await user.click(screen.getByRole('button',{name:'Submit session'}));
 await waitFor(()=>expect(fb.current.persistVocabularySession).toHaveBeenCalled());
 expect(fb.current.persistVocabularySession.mock.calls[0][0].vocabularySessions[0].results[0].result).toBe('success');
});


test('explicit unlearned catalog drill keeps its group sense and makes no preparation writes', async()=>{
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));Object.assign(VOCABULARY_CATALOG,released);
  const raw=released.entries.find((entry:any)=>entry.term==='core');fb.current.state.vocabulary=[];fb.current.state.vocabularyEvidence=[];fb.current.loadVocabularyCatalog=vi.fn(async()=>true);
  const before=JSON.stringify(fb.current.state);const view=mount(`?entryId=${raw.id}&senseId=editorial%3Acore%3Afruit-centre&bookId=guixue%3A10174&unitId=21840&dueOnly=false&returnTo=%2Fvocabulary%2Fentry%2F${raw.id}`);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Start session'})).toBeEnabled());expect(screen.getByText(/containing its seeds/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button',{name:'Start session'}));expect(screen.getAllByRole('textbox')).toHaveLength(1);
  const draft=JSON.parse(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')!).session;expect(draft.cardSnapshots[0].context).toMatchObject({bookId:'guixue:10174',unitId:'21840',senseId:'editorial:core:fruit-centre'});expect(draft.cardSnapshots[0].entry.senses[0].definition).toContain('seeds');expect(JSON.stringify(fb.current.state)).toBe(before);expect(fb.current.persistNow).not.toHaveBeenCalled();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();view.unmount();
  mount('?dueOnly=false');expect(await screen.findByText('No words match these filters.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Start session'})).toBeDisabled();
});

test('direct historical route loads the frozen session source book without a book query', async()=>{
  fb.current.loadVocabularyCatalog=vi.fn(async()=>true);fb.current.state.vocabularySessions=[{id:'history-book',mode:'dictation',status:'submitted',filter:{},selection:{kind:'unit',bookId:'source-book',unitId:'source-group'},preferences:{},results:[{cardId:'historic-card',entryId:'historic-word',senseId:'historic-sense',term:'peel',response:'peal',expectedAnswer:'peel',definition:'Old meaning.',example:'',result:'failure'}],entryIds:['historic-word'],summary:{total:1,correct:0,incorrect:1,pending:0},submittedAt:'2025-01-01',startedAt:'2025-01-01'}];
  render(<MemoryRouter initialEntries={['/vocabulary/history/history-book']}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes></MemoryRouter>);
  expect(await screen.findByRole('table')).toBeInTheDocument();await waitFor(()=>expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith('source-book'));expect(screen.getByRole('button',{name:'Play UK pronunciation of peel'})).toBeInTheDocument();expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test.each([false, true])('historical food core retry retains changed-sense dictation with mixed failures=%s', async mixed => {
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  Object.assign(VOCABULARY_CATALOG, released);
  const raw = released.entries.find((entry: any) => entry.term === 'core');
  const old = {cardId:'ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:dictation',entryId:raw.id,senseId:'kaikki:846f18ca02f7f1d01c',term:'core',expectedAnswer:'core',response:'cor',result:'failure',definition:'Old core definition.',example:''};
  const rows = mixed ? [old, {cardId:'entry-0:sense-0:dictation',entryId:'entry-0',senseId:'sense-0',term:'resilient',expectedAnswer:'resilient',response:'wrong',result:'failure',definition:'Definition 0',example:'A resilient community.'}] : [old];
  // A legacy record can refer to public words absent from the learner's active list.
  fb.current.state.vocabularySessions = [{id:'legacy-food',mode:'dictation',status:'submitted',selection:{kind:'unit',bookId:'guixue:10174',unitId:'21840'},filter:{},preferences:{order:'source'},results:rows,entryIds:rows.map(row=>row.entryId),summary:{total:rows.length,correct:0,incorrect:rows.length,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  if (mixed) fb.current.state.vocabulary[0].sources.push({type:'wordbook',id:'old-food-member',bookId:'guixue:10174',unitId:'21840'});
  fb.current.loadVocabularyCatalog = vi.fn(async()=>true);
  const before = JSON.stringify(fb.current.state);
  render(<MemoryRouter initialEntries={['/vocabulary/history/legacy-food']}><Routes><Route path='/vocabulary/history/:sessionId' element={<VocabularyPracticePage/>}/></Routes></MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getAllByRole('textbox')).toHaveLength(rows.length);
  const draft = JSON.parse(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')!).session;
  expect(draft.cardIds).toContainEqual({id:'ve-7c70dbbe:editorial:core:fruit-centre:dictation',entryId:'ve-7c70dbbe',senseId:'editorial:core:fruit-centre',mode:'dictation'});
  expect(JSON.stringify(fb.current.state)).toBe(before);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry uses the frozen non-dictation task and preserves stored history', async () => {
  const card = getVocabularyReviewQueue(fb.current.state, {mode:'definition',dueOnly:false})[0];
  card.task = {prompt:'Original money meaning.',acceptedAnswers:['original-answer'],explanation:'Original explanation.'};
  const frozen = createVocabularySession([card], 'definition', {order:'source'});
  const row = evaluateVocabularySessionAnswer(card, 'wrong');
  const record = {...frozen,status:'submitted',results:[row],entryIds:[card.entryId],reviewIds:[],summary:{total:1,correct:0,incorrect:1,pending:0},submittedAt:'2025-01-01'};
  fb.current.state.vocabularySessions = [record];
  fb.current.state.vocabulary[0].senses[0].definition = 'Current different sense meaning.';
  const before = JSON.stringify(fb.current.state);
  mount(`?sessionId=${record.id}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByText('Original money meaning.')).toBeInTheDocument();
  await user.type(screen.getByRole('textbox',{name:'Answer 1'}),'original-answer');
  await user.click(screen.getByRole('button',{name:'Submit session'}));
  const submitted = fb.current.persistVocabularySession.mock.calls[0][0];
  expect(submitted.vocabularySessions[1].results[0]).toMatchObject({result:'success',senseId:card.senseId,expectedAnswer:'original-answer',prompt:'Original money meaning.'});
  expect(submitted.vocabularySessions[0]).toEqual(record);
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

test('historical retry visibly blocks unavailable tasks instead of silently retrying a subset', async () => {
  const card = getVocabularyReviewQueue(fb.current.state,{mode:'definition',dueOnly:false})[0];
  const row = evaluateVocabularySessionAnswer(card,'wrong');
  fb.current.state.vocabularySessions = [{id:'unavailable-retry',mode:'definition',status:'submitted',filter:{},preferences:{},results:[row,{...row,cardId:'removed:lost:synonym',entryId:'removed',senseId:'lost',term:'lost word'}],entryIds:[card.entryId,'removed'],summary:{total:2,correct:0,incorrect:2,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  const before = JSON.stringify(fb.current.state);
  mount('?sessionId=unavailable-retry');
  await userEvent.setup().click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('alert')).toHaveTextContent(/unavailable.*lost word/i);
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

function delayedHistoryFixture() {
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
  const raw=released.entries.find((entry:any)=>entry.term==='core');
  const row={cardId:'ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:dictation',entryId:raw.id,senseId:'kaikki:846f18ca02f7f1d01c',term:'core',expectedAnswer:'core',response:'cor',result:'failure',definition:'Old core definition.',example:''};
  fb.current.state.vocabularySessions=[{id:'delayed-history',mode:'dictation',status:'submitted',selection:{kind:'unit',bookId:'guixue:10174',unitId:'21840'},filter:{},preferences:{},results:[row],entryIds:[raw.id],summary:{total:1,correct:0,incorrect:1,pending:0},startedAt:'2025-01-01',submittedAt:'2025-01-01'}];
  VOCABULARY_CATALOG.entries=originalCatalog.entries.filter(entry=>entry.id!==raw.id);
  VOCABULARY_CATALOG.memberships=originalCatalog.memberships.filter(member=>member.entryId!==raw.id);
  let complete!:()=>void;
  let fail!:(error:Error)=>void;
  const pending=new Promise<void>((resolve,reject)=>{complete=()=>{Object.assign(VOCABULARY_CATALOG,released);resolve();};fail=reject;});
  fb.current.loadVocabularyCatalog=vi.fn((book?:string)=>book==='guixue:10174'?pending:Promise.resolve());
  return {complete,fail,before:JSON.stringify(fb.current.state)};
}

test('historical retry waits for delayed source catalog and prevents duplicate retry clicks',async()=>{
  const {complete,before}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  const button=await screen.findByRole('button',{name:'Retry mistakes'});
  fireEvent.click(button);fireEvent.click(button);
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(fb.current.loadVocabularyCatalog.mock.calls.filter(([book]:[string])=>book==='guixue:10174')).toHaveLength(2); // one background load, one guarded retry wait
  await act(async()=>complete());
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
  expect(JSON.stringify(fb.current.state)).toBe(before);
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry load failure keeps results and supports a successful second click',async()=>{
  const {complete,fail,before}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  await act(async()=>fail(new Error('Offline')));
  expect(await screen.findByRole('alert')).toHaveTextContent(/wordbook.*could not be loaded/i);
  expect(screen.getByRole('button',{name:'Retry mistakes'})).toBeEnabled();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  fb.current.loadVocabularyCatalog.mockImplementation(async()=>complete());
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry mistakes'}));
  expect(await screen.findByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
  expect(JSON.stringify(fb.current.state)).toBe(before);
});

test('historical retry ignores a delayed catalog completion after account changes',async()=>{
  const {complete}=delayedHistoryFixture();
  const view=mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  owner.current='account-two';
  fb.current.state={...fb.current.state,vocabularySessions:[]};fb.current.stateRef.current=fb.current.state;
  view.rerender(<MemoryRouter><VocabularyPracticePage/></MemoryRouter>);
  await act(async()=>complete());
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-two')).toBeNull();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical retry does not start after leaving the results while the catalog loads',async()=>{
  const {complete}=delayedHistoryFixture();
  mount('?sessionId=delayed-history');
  fireEvent.click(await screen.findByRole('button',{name:'Retry mistakes'}));
  expect(screen.getByRole('button',{name:/Preparing retry/i})).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button',{name:'New session'}));
  await act(async()=>complete());
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('fieldbook-vocabulary-draft-v1:account-one')).toBeNull();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});
