import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { addVocabularyItem } from '../../domain/vocabulary';
import { resetDictionaryCache } from '../vocabulary/dictionary';
import { PartVocabularyPanel } from './PartVocabularyPanel';
import type { ExamCatalog, ExamAttempt } from '../../domain/exam/types';
const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'one' }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
const provenance = { sourceUrl: '', sourceVersion: '1', fetchedAt: '', contentHash: '', authorization: 'owned' };
const catalog = { schemaVersion: 1, papers: [], assets: [], questions: [], sections: [{ id: 'one', skill: 'reading', part: 1, title: 'River', sentences: [], provenance }, { id: 'two', skill: 'reading', part: 2, title: 'Money', sentences: [], provenance }], passages: [{ id: 'p1', sectionId: 'one', paragraphs: [{ id: 'A', text: 'The bank meets another bank.' }], provenance }, { id: 'p2', sectionId: 'two', paragraphs: [{ id: 'B', text: 'A bank lends money.' }], provenance }] } as unknown as ExamCatalog;
const attempt = { id: 'attempt', sectionIds: ['one', 'two'], skill: 'reading', mode: 'mock', status: 'completed' } as ExamAttempt;
const senses = [{ id: 'river', definition: 'Land beside a river.', pos: 'noun', example: '' }, { id: 'money', definition: 'A financial institution.', pos: 'noun', example: '' }];
beforeEach(() => {
  resetDictionaryCache(); mocks.owner = 'one';
  const state = emptyState(); mocks.fb = { state, stateRef: { current: state }, toast: vi.fn(), saveVocabularyEntry: vi.fn(async (input: any) => { addVocabularyItem(state, input); return true; }) };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('index.json') ? { bank: 'aa.json' } : { senses } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function panel(sectionId = 'one') { return <MemoryRouter><PartVocabularyPanel catalog={catalog} attempt={attempt} sectionId={sectionId} /></MemoryRouter>; }
async function chooseRiver() {
  await userEvent.setup().click(screen.getByRole('button', { name: /Vocabulary candidates/ }));
  await screen.findByText('bank');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Choose meanings for bank' }));
  await userEvent.setup().click(await screen.findByRole('checkbox', { name: /Land beside a river/ }));
}
test('dictionary loading is lazy, and only confirmed meanings and exact occurrences are collected', async () => {
  render(panel());
  expect(fetch).not.toHaveBeenCalled();
  await chooseRiver();
  expect(screen.getByRole('checkbox', { name: /financial institution/ })).not.toBeChecked();
  expect(mocks.fb.saveVocabularyEntry).not.toHaveBeenCalled();
  expect(mocks.fb.state.vocabularyEvidence).toEqual([]);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save selected meanings (1)' }));
  await screen.findByText('1 word saved.');
  expect(mocks.fb.state.vocabulary[0].senses.map((sense: any) => sense.id)).toEqual(['river']);
  expect(mocks.fb.state.vocabulary[0].sources).toHaveLength(2);
  expect(mocks.fb.state.vocabulary[0].sources.every((source: any) => source.id === 'one' && source.senseId === 'river')).toBe(true);
  expect(mocks.fb.state.vocabularyStates[0]).toMatchObject({ reviewCount: 0, cards: {} });
  expect(mocks.fb.state.vocabularyEvidence).toEqual([]);
});
test('a failed save retains selected meanings and can be retried', async () => {
  mocks.fb.saveVocabularyEntry.mockResolvedValueOnce(false);
  render(panel()); await chooseRiver();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save selected meanings (1)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('checkbox', { name: /Land beside a river/ })).toBeChecked();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save selected meanings (1)' }));
  await screen.findByText('1 word saved.');
});

test('a failed dictionary term lookup is retryable without choosing a meaning automatically', async () => {
  let fail = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('index.json') ? { ok: true, json: async () => ({ bank: 'aa.json' }) } : fail ? { ok: false } : { ok: true, json: async () => ({ senses }) }));
  render(panel());
  await userEvent.setup().click(screen.getByRole('button', { name: /Vocabulary candidates/ }));
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Choose meanings for bank' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Meanings could not be loaded');
  fail = false;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry loading' }));
  expect(await screen.findByRole('checkbox', { name: /Land beside a river/ })).not.toBeChecked();
});

test('a slow meanings request can be retried and its late rejection cannot erase fresh meanings', async () => {
  vi.useFakeTimers();
  let rejectOld!: (error: Error) => void;
  let termRequests = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('index.json')) return { ok: true, json: async () => ({ bank: 'aa.json' }) };
    if (termRequests++ === 0) return new Promise((_, reject) => { rejectOld = reject; });
    return { ok: true, json: async () => ({ senses }) };
  }));
  render(panel());
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Vocabulary candidates/ })));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Choose meanings for bank' })));
  act(() => vi.advanceTimersByTime(10_000));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry meanings' })));
  expect(screen.getByRole('checkbox', { name: /Land beside a river/ })).toBeInTheDocument();
  await act(async () => rejectOld(new Error('old request rejected')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Land beside a river/ })).toBeInTheDocument();
});
test('switching account or Part discards selections and ignores a late save status', async () => {
  let finish!: (value: boolean) => void;
  mocks.fb.saveVocabularyEntry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(panel()); await chooseRiver();
  fireEvent.click(screen.getByRole('button', { name: 'Save selected meanings (1)' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  mocks.owner = 'two'; mocks.fb.state = emptyState(); mocks.fb.stateRef.current = mocks.fb.state;
  view.rerender(panel('two'));
  await act(async () => finish(true));
  expect(screen.queryByText('1 word saved.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Saved/ })).toHaveAttribute('aria-pressed', 'true');
  expect(mocks.fb.state.vocabulary).toEqual([]);
});
test('Saved tab lists the exact Part with source and review backlinks', async () => {
  const entry = addVocabularyItem(mocks.fb.state, { term: 'bank', senses: [senses[0]], sources: [{ type: 'reading', id: 'one', senseId: 'river', exam: { sectionId: 'one', paragraphId: 'A', blockId: 'passage:p1:A', quote: 'bank', start: 4, end: 8 } }] }).item!;
  addVocabularyItem(mocks.fb.state, { term: 'money', senses: [senses[1]], sources: [{ type: 'reading', id: 'two', exam: { sectionId: 'two' } }] });
  render(panel());
  expect(screen.queryByText('money')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'bank' })).toHaveAttribute('href', expect.stringContaining(`/vocabulary/entry/${entry.id}`));
  expect(screen.getByRole('link', { name: /Original source/ })).toHaveAttribute('href', expect.stringContaining('/reading/source/one?paragraph=A&block=passage%3Ap1%3AA&quote=bank'));
  const review = screen.getByRole('link', { name: 'Review this Part vocabulary' }).getAttribute('href')!;
  expect(new URL(review, 'https://example.test').searchParams.get('sourceId')).toBe('one');
});
