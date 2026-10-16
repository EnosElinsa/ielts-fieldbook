import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addVocabularyItem } from "../../domain/vocabulary";
import { emptyState } from "../../domain";
import { DictionarySenses, resetDictionaryCache } from "./DictionarySenses";
import "@testing-library/jest-dom/vitest";
const mocks = vi.hoisted(() => ({ current: null as any }));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => mocks.current,
}));
beforeEach(() => resetDictionaryCache());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const sourceSense = {
  id: "wiki:1",
  definition: "To lessen severity.",
  example: "The measure mitigates hardship.",
  pos: "verb",
  source: "English Wiktionary",
  attribution: "English Wiktionary contributors",
  license: "CC-BY-SA-4.0",
  sourceUrl: "https://en.wiktionary.org/wiki/mitigate",
};
const dictionaryFetch = (senses = [sourceSense]) => vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { mitigate: 'aa.json' } : { senses } }));

test('a revised learning meaning excludes its original dictionary version by sense identity', async () => {
  const { entry } = fixture();
  const revised = { ...sourceSense, definition: 'To make something harmful less severe.', example: 'The new barriers mitigate flood damage.' };
  vi.stubGlobal('fetch', dictionaryFetch([sourceSense, { ...sourceSense, id:'wiki:other', definition:'To make a punishment less severe.' }]));
  const view=render(<MemoryRouter><DictionarySenses entry={entry} excludeSenses={[revised]} /></MemoryRouter>);
  await screen.findByText('To make a punishment less severe.');
  expect(screen.queryByText('To lessen severity.')).not.toBeInTheDocument();
  expect(screen.getByText('Other dictionary meanings (1)')).toBeInTheDocument();
  view.rerender(<MemoryRouter><DictionarySenses entry={entry} excludeSenses={[{...revised,id:'wiki:other'}]} /></MemoryRouter>);
  expect(await screen.findByText('To lessen severity.')).toBeInTheDocument();
  expect(screen.queryByText('To make a punishment less severe.')).not.toBeInTheDocument();
});
function fixture() {
  const state = emptyState();
  const entry = addVocabularyItem(state, {
    term: "mitigate",
    meaning: "Reduce an adverse effect.",
  }).item!;
  const save = vi.fn(async (draft) => {
    mocks.current.stateRef.current = draft;
    return true;
  });
  mocks.current = { stateRef: { current: state }, persistNow: save };
  return { entry, save };
}
function Route() {
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}
test('slow dictionary retry starts a fresh fetch and an older rejection cannot clear the new cache', async () => {
  vi.useFakeTimers();
  const { entry } = fixture();
  let rejectOld!: (error: Error) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ mitigate: 'aa.json' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ senses: [sourceSense] }) });
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter><DictionarySenses entry={entry} /></MemoryRouter>);
  fireEvent.click(screen.getByText(/Other dictionary meanings/));
  expect(screen.getByRole('status')).toHaveTextContent('Loading dictionary meanings…');
  expect(screen.queryByRole('button', { name: 'Retry dictionary' })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10_000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry dictionary' })));
  expect(screen.getByText('To lessen severity.')).toBeInTheDocument();
  await act(async () => rejectOld(new Error('Old request failed late')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const otherEntry = { ...entry, id: 'other', term: 'another' };
  render(<MemoryRouter><DictionarySenses entry={otherEntry} /></MemoryRouter>);
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(3);
});
test("dictionary reports deduplicated credits to the parent and explicit study preserves the detail origin", async () => {
  const { entry, save } = fixture();
  const sources = vi.fn();
  vi.stubGlobal(
    "fetch",
    dictionaryFetch([
              sourceSense,
              {
                ...sourceSense,
                id: "wiki:2",
                pos: " VERB ",
                definition: " To lessen severity. ",
              },
              {
                ...sourceSense,
                id: "same",
                definition: entry.senses[0].definition,
                pos: entry.senses[0].pos,
              },
            ]),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/vocabulary/entry/original?returnTo=%2Fvocabulary%2Fwords%3Fsearch%3Dmit",
      ]}
    >
      <DictionarySenses entry={entry} onSources={sources} />
      <Route />
    </MemoryRouter>,
  );
  expect(await screen.findByText("To lessen severity.")).toBeInTheDocument();
  await waitFor(() => expect(sources).toHaveBeenLastCalledWith([sourceSense]));
  expect(
    screen.queryByText(/English Wiktionary contributors/),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByText(/Other dictionary meanings/));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Practise this sense" }));
  expect(
    save.mock.calls[0][0].vocabulary[0].senses.some(
      (sense: any) => sense.license === "CC-BY-SA-4.0",
    ),
  ).toBe(true);
  expect(save.mock.calls[0][0].vocabularyEvidence).toHaveLength(0);
  const route = await screen.findByText(/^\/vocabulary\/review\?/);
  const url = new URL(route.textContent!, "https://test.test");
  expect(url.searchParams.get("returnTo")).toBe(
    "/vocabulary/entry/original?returnTo=%2Fvocabulary%2Fwords%3Fsearch%3Dmit",
  );
  expect(url.searchParams.get("senseId")).toBe(sourceSense.id);
});
test("loading is distinct from empty and failed index requests are retried", async () => {
  const { entry } = fixture();
  let finish!: (value: any) => void;
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [] }) });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter>
      <DictionarySenses entry={entry} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading dictionary");
  expect(
    screen.queryByText("No additional dictionary senses available."),
  ).not.toBeInTheDocument();
  finish({ ok: false });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Dictionary could not be loaded",
  );
  await userEvent.setup().click(screen.getByText(/Other dictionary meanings/));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry dictionary" }));
  expect(
    await screen.findByText("No additional dictionary senses available."),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
test("failed manual save leaves the sense and offers a repeat attempt", async () => {
  const { entry, save } = fixture();
  save.mockResolvedValueOnce(false);
  vi.stubGlobal(
    "fetch",
    dictionaryFetch(),
  );
  render(
    <MemoryRouter>
      <DictionarySenses entry={entry} />
    </MemoryRouter>,
  );
  await screen.findByText("To lessen severity.");
  await userEvent.setup().click(screen.getByText(/Other dictionary meanings/));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Practise this sense" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be saved",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Practise this sense" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});

test("exclusions update without reloading the term and relation fragments are not examples", async () => {
  const { entry } = fixture();
  const relationSense = {
    ...sourceSense,
    example: "Meronym: [[stock animal]]",
    usage: "usually",
  };
  const fetchMock = dictionaryFetch([relationSense]);
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
    <MemoryRouter>
      <DictionarySenses entry={entry} />
    </MemoryRouter>,
  );
  expect(await screen.findByText("stock animal")).toBeInTheDocument();
  expect(screen.queryByText("usually")).not.toBeInTheDocument();
  expect(screen.getByText("stock animal").closest("blockquote")).toBe(null);
  expect(screen.getByText("Other dictionary meanings (1)")).toBeInTheDocument();
  view.rerender(
    <MemoryRouter>
      <DictionarySenses entry={entry} excludeSenses={[sourceSense]} />
    </MemoryRouter>,
  );
  expect(screen.queryByText("To lessen severity.")).not.toBeInTheDocument();
  expect(screen.getByText("Other dictionary meanings (0)")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("a late dictionary response cannot replace the new term", async () => {
  const { entry } = fixture();
  let finish!: (value: any) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mitigate: "aa.json", core: "bb.json" }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          senses: [
            {
              ...sourceSense,
              id: "core:1",
              definition: "The centre of something.",
            },
          ],
        }),
      }),
  );
  const view = render(
    <MemoryRouter>
      <DictionarySenses entry={entry} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  view.rerender(
    <MemoryRouter>
      <DictionarySenses entry={{ ...entry, id: "core", term: "core" }} />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText("The centre of something."),
  ).toBeInTheDocument();
  finish({ ok: true, json: async () => ({ senses: [sourceSense] }) });
  await waitFor(() =>
    expect(screen.queryByText("To lessen severity.")).not.toBeInTheDocument(),
  );
});

test("a save completed after changing term does not navigate away from the new detail", async () => {
  const { entry, save } = fixture();
  let finish!: (value: boolean) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal(
    "fetch",
    dictionaryFetch(),
  );
  const view = render(
    <MemoryRouter initialEntries={["/vocabulary/entry/original"]}>
      <DictionarySenses entry={entry} />
      <Route />
    </MemoryRouter>,
  );
  await screen.findByText("To lessen severity.");
  await userEvent.setup().click(screen.getByText(/Other dictionary meanings/));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Practise this sense" }));
  view.rerender(
    <MemoryRouter initialEntries={["/vocabulary/entry/original"]}>
      <DictionarySenses entry={{ ...entry, id: "core", term: "core" }} />
      <Route />
    </MemoryRouter>,
  );
  finish(true);
  await waitFor(() =>
    expect(screen.getByText("/vocabulary/entry/original")).toBeInTheDocument(),
  );
});
