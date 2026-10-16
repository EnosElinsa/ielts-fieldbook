import { act, fireEvent, render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addVocabularyItem } from "../../domain/vocabulary";
import { emptyState } from "../../domain";
import { DictionarySenses, resetDictionaryCache } from "./DictionarySenses";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from 'node:fs';
import { selectChoice } from '../../../tests/selectChoice';
import diagrams from '../../domain/vocabulary/senseDiagrams.json';
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

test('the completed bank review exposes learning notes for every meaning in either coverage view', async () => {
  const { entry } = fixture();
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const dictionary = JSON.parse(readFileSync(`public/dictionary/${index.bank}`, 'utf8'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { bank: index.bank } : dictionary })));
  render(<MemoryRouter><DictionarySenses entry={{ ...entry, id: 've-7c704483', term: 'bank' }} excludeSenses={[]} /></MemoryRouter>);
  await screen.findByText('We sat on the bank of the river and watched the boats.');
  fireEvent.click(screen.getByText(/Other dictionary meanings/));
  expect(screen.queryByText('A surname.')).not.toBeInTheDocument();
  expect(screen.getByText('A family name.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'With learning notes (45)' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'All meanings (45)' }));
  expect(screen.getByText('A family name.')).toBeInTheDocument();
  expect(screen.getByText('Dr Bank presented the opening lecture.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('45 of 45 meanings');
  fireEvent.click(screen.getByRole('button', { name: 'With learning notes (45)' }));
  expect(screen.queryByText('A surname.')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('45 of 45 meanings');
});

test('a dictionary diagram can be previewed and closed without saving a meaning or leaving the page', async () => {
  const { entry, save } = fixture();
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const dictionary = JSON.parse(readFileSync(`public/dictionary/${index.bank}`, 'utf8'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { bank: index.bank } : dictionary })));
  render(<MemoryRouter initialEntries={['/vocabulary/entry/bank']}><DictionarySenses entry={{ ...entry, id: 've-7c704483', term: 'bank' }} excludeSenses={[]} /><Route /></MemoryRouter>);
  const diagram = diagrams.find(row => row.kind === 'river-bank')!;
  const definition = await screen.findByText(diagram.definition);
  const meaning = within(definition.closest('section')!);
  const user = userEvent.setup();
  await user.click(screen.getByText(/Other dictionary meanings/));
  expect(meaning.queryByRole('img')).not.toBeInTheDocument();
  await user.click(meaning.getByText('View diagram'));
  expect(await meaning.findByRole('img', { name: /^bank:/ })).toBeVisible();
  await user.click(meaning.getByText('View diagram'));
  await waitFor(() => expect(meaning.queryByRole('img')).not.toBeInTheDocument());
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText('/vocabulary/entry/bank')).toBeInTheDocument();
  expect(mocks.current.stateRef.current.vocabularyEvidence).toEqual([]);
});

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

test('dictionary search finds examples and learning notes, combines with part of speech and clears empty results', async () => {
  const { entry } = fixture();
  const noun = { ...sourceSense, id: 'noun', pos: 'noun', definition: 'A lessening of severity.', example: 'The barriers provided protection.' };
  const noted = { ...sourceSense, collocations: ['mitigate flood damage'], distinctions: ['Reduce is a broader word.'] };
  vi.stubGlobal('fetch', dictionaryFetch([noted, noun]));
  const sources = vi.fn();
  render(<MemoryRouter><DictionarySenses entry={entry} onSources={sources} /></MemoryRouter>);
  await screen.findByText(noun.definition);
  fireEvent.click(screen.getByText(/Other dictionary meanings/));
  const search = screen.getByRole('searchbox', { name: 'Search dictionary meanings' });
  fireEvent.change(search, { target: { value: ' FLOOD   DAMAGE ' } });
  expect(screen.getByText(sourceSense.definition)).toBeInTheDocument();
  expect(screen.queryByText(noun.definition)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 of 2 meanings');
  await selectChoice(screen.getByRole('combobox', { name: 'Dictionary part of speech' }), 'Noun');
  expect(screen.getByText('No meanings match your filters.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(search).toHaveValue('');
  expect(screen.getByText(noun.definition)).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'protection' } });
  expect(screen.getByText(noun.definition)).toBeInTheDocument();
  expect(screen.queryByText(sourceSense.definition)).not.toBeInTheDocument();
  await waitFor(() => expect(sources).toHaveBeenLastCalledWith([noted, noun]));
});

test('switching dictionary coverage preserves search and makes unreviewed matches available explicitly', async () => {
  const { entry } = fixture();
  const noted = { ...sourceSense, editorial: { source: 'Review', license: 'CC-BY-4.0', attribution: 'Contributors' }, collocations: ['mitigate risk'], distinctions: ['Reduce is broader.'] };
  const historical = { ...sourceSense, id: 'historical', pos: 'noun', definition: 'A historical consideration.', usage: 'Archaic.' };
  vi.stubGlobal('fetch', dictionaryFetch([noted, historical]));
  render(<MemoryRouter><DictionarySenses entry={entry} /></MemoryRouter>);
  await screen.findByText(noted.definition);
  fireEvent.click(screen.getByText(/Other dictionary meanings/));
  const search = screen.getByRole('searchbox', { name: 'Search dictionary meanings' });
  fireEvent.change(search, { target: { value: 'archaic' } });
  expect(screen.getByText('No meanings match your filters.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All meanings (2)' }));
  expect(search).toHaveValue('archaic');
  expect(screen.getByText(historical.definition)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 of 2 meanings');
});

test('changing the word resets dictionary search and part of speech', async () => {
  const { entry } = fixture();
  const other = { ...sourceSense, id: 'other', pos: 'noun', definition: 'Another word’s meaning.' };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { mitigate: 'aa.json', other: 'bb.json' } : { senses: [url.includes('aa.json') ? sourceSense : other] } })));
  const view = render(<MemoryRouter><DictionarySenses entry={entry} /></MemoryRouter>);
  await screen.findByText(sourceSense.definition);
  fireEvent.click(screen.getByText(/Other dictionary meanings/));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search dictionary meanings' }), { target: { value: 'severity' } });
  await selectChoice(screen.getByRole('combobox', { name: 'Dictionary part of speech' }), 'Verb');
  view.rerender(<MemoryRouter><DictionarySenses entry={{ ...entry, id: 'other', term: 'other' }} /></MemoryRouter>);
  await screen.findByText(other.definition);
  expect(screen.getByRole('searchbox', { name: 'Search dictionary meanings' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Dictionary part of speech' })).toHaveTextContent('All parts of speech');
});
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
