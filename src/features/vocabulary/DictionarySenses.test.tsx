import { render, screen, cleanup, waitFor } from "@testing-library/react";
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
test("dictionary reports deduplicated credits to the parent and explicit study preserves the detail origin", async () => {
  const { entry, save } = fixture();
  const sources = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        entries: [
          {
            term: "mitigate",
            senses: [
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
            ],
          },
        ],
      }),
    })),
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
  expect(sources).toHaveBeenLastCalledWith([sourceSense]);
  expect(
    screen.queryByText(/English Wiktionary contributors/),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByText(/English dictionary/));
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
  await userEvent.setup().click(screen.getByText(/English dictionary/));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry dictionary" }));
  expect(
    await screen.findByText("No additional dictionary senses available."),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
test("failed manual save leaves the sense and offers a repeat attempt", async () => {
  const { entry, save } = fixture();
  save.mockResolvedValueOnce(false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        entries: [{ term: "mitigate", senses: [sourceSense] }],
      }),
    })),
  );
  render(
    <MemoryRouter>
      <DictionarySenses entry={entry} />
    </MemoryRouter>,
  );
  await screen.findByText("To lessen severity.");
  await userEvent.setup().click(screen.getByText(/English dictionary/));
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
