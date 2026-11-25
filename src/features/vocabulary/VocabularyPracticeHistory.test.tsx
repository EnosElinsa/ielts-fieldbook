import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptyCard } from 'ts-fsrs';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyPracticePage } from './VocabularyPracticePage';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';

configure({ asyncUtilTimeout: 5000 });

const { fb, player } = vi.hoisted(() => ({
  fb: { current: null as any },
  player: { play: vi.fn(), stop: vi.fn() },
}));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => fb.current }));
vi.mock('../../storage/remote', () => ({ accountId: () => 'history-account' }));
vi.mock('./playback', () => ({ createVocabularyPlayback: () => player }));
vi.mock('./VocabularyPages', () => ({ VocabularyNavigation: () => <nav aria-label="Vocabulary views" /> }));

const originalCatalog = { books: [...VOCABULARY_CATALOG.books], units: [...VOCABULARY_CATALOG.units], entries: [...VOCABULARY_CATALOG.entries], memberships: [...VOCABULARY_CATALOG.memberships] };
const originalScrollTo = window.scrollTo;
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  window.scrollTo = vi.fn();
  localStorage.clear();
  sessionStorage.clear();
  player.play.mockReset().mockResolvedValue({ ok: true, source: 'speech', accent: 'uk', voice: 'Test UK voice' });
  player.stop.mockReset();
  const vocabulary = ['resilient', 'sustainable'].map((term, index) => ({
    id: `entry-${index}`, term, category: 'word', tags: [], sources: [{ type: 'personal', id: 'personal' }],
    senses: [{ id: `sense-${index}`, definition: `Definition ${index}`, example: `A ${term} community.`, pos: 'adjective' }],
    meaning: `Definition ${index}`, example: `A ${term} community.`, createdAt: '2020-01-01', updatedAt: '2020-01-01',
  }));
  const state = {
    vocabulary,
    vocabularyStates: vocabulary.map((entry, index) => ({ id: `state-${index}`, entryId: entry.id, senseId: entry.senses[0].id, cards: Object.fromEntries(['dictation', 'definition', 'cloze', 'synonym', 'distinction', 'production'].map(mode => [mode, createEmptyCard(new Date('2020-01-01'))])), dimensions: {}, reviewCount: 0, wrong: { active: false, successesSinceFailure: 0, modes: {} } })),
    vocabularyReviews: [], vocabularyEvidence: [], vocabularySessions: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], plans: [], settings: {},
  };
  fb.current = { state, stateRef: { current: state }, toast: vi.fn(), persistNow: vi.fn(async () => true), saveVocabularyPreferences: vi.fn(async () => true), persistVocabularySession: vi.fn(async () => true), loadVocabularyCatalog: vi.fn(async () => true) };
});
afterEach(() => {
  cleanup();
  window.scrollTo = originalScrollTo;
  VOCABULARY_CATALOG.books = [...originalCatalog.books]; VOCABULARY_CATALOG.units = [...originalCatalog.units];
  VOCABULARY_CATALOG.entries = [...originalCatalog.entries]; VOCABULARY_CATALOG.memberships = [...originalCatalog.memberships];
});

const summary = (total: number) => ({ total, correct: total, incorrect: 0, pending: 0 });
function record(over: Record<string, unknown> = {}) {
  return { id: 'saved', mode: 'dictation', status: 'submitted', preferences: {}, filter: {}, results: [], entryIds: [], summary: summary(0), startedAt: '2025-01-01', submittedAt: '2025-01-01', ...over };
}
function mountHistory(id: string) {
  return render(<MemoryRouter initialEntries={[`/vocabulary/history/${id}`]}><Routes><Route path="/vocabulary/history/:sessionId" element={<VocabularyPracticePage />} /></Routes></MemoryRouter>);
}
const row = (entryId: string, senseId: string, over: Record<string, unknown> = {}) => ({ cardId: `${entryId}:${senseId}:dictation`, entryId, senseId, term: entryId, response: entryId, expectedAnswer: entryId, result: 'success', definition: '', example: '', ...over });

test('direct historical open loads every tested word from its own frozen book and group, even without record.entryIds', async () => {
  fb.current.state.vocabularySessions = [record({
    id: 'mixed-groups', selection: { kind: 'review' }, entryIds: [],
    results: [
      row('word-a', 'sense-a', { definition: 'Meaning A.', context: { entryId: 'word-a', senseId: 'sense-a', bookId: 'book-a', unitId: 'unit-a', version: 'v', status: 'reviewed' } }),
      row('word-b', 'sense-b', { definition: 'Meaning B.', context: { entryId: 'word-b', senseId: 'sense-b', bookId: 'book-b', unitId: 'unit-b', version: 'v', status: 'reviewed' } }),
      row('word-c', 'sense-c', { definition: 'Meaning C.' }),
    ],
    summary: summary(3),
  })];
  mountHistory('mixed-groups');
  expect(await screen.findByRole('table')).toBeInTheDocument();
  await waitFor(() => expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith('book-a', { unitId: 'unit-a', entryIds: ['word-a'] }));
  expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith('book-b', { unitId: 'unit-b', entryIds: ['word-b'] });
  expect(fb.current.loadVocabularyCatalog).toHaveBeenCalledWith(undefined, { entryIds: ['word-c'] });
  expect(screen.getByText('Meaning A.')).toBeVisible();
  expect(screen.getByText('Meaning B.')).toBeVisible();
  expect(fb.current.persistVocabularySession).not.toHaveBeenCalled();
});

test('historical rows show the tested part of speech for an unmodified sense and never relabel an edited wordbook sense', async () => {
  const [kept, edited] = fb.current.state.vocabulary;
  edited.senses[0] = { ...edited.senses[0], definition: 'Edited after the session.', pos: 'noun' };
  fb.current.state.vocabularySessions = [record({
    id: 'no-snapshot', entryIds: [kept.id, edited.id], summary: summary(2),
    results: [
      row(kept.id, kept.senses[0].id, { term: kept.term, definition: kept.senses[0].definition, example: kept.senses[0].example }),
      row(edited.id, edited.senses[0].id, { term: edited.term, definition: 'Definition 1', example: 'A sustainable community.' }),
    ],
  })];
  mountHistory('no-snapshot');
  const tested = await screen.findByText('Definition 0');
  expect(tested).toHaveTextContent(/adjective/i);
  const old = screen.getByText('Definition 1');
  expect(old).not.toHaveTextContent(/noun/i);
  expect(old).toHaveTextContent('Meaning in this session');
  expect(screen.getByText('Edited after the session.')).toBeInTheDocument();
});

test('a matching recording is passed to playback so a failed card can retry its audio', async () => {
  const raw = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8')).entries.find((e: any) => e.term === 'record');
  const correction = JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json', 'utf8')).find((r: any) => r.senseId === 'kaikki:5386f9871d2cf75669');
  const sense = { ...correction.originalSense, definition: correction.definition, example: correction.example };
  fb.current.state.vocabulary = [{ ...raw, senses: [sense] }];
  fb.current.state.settings.vocabulary = { autoPlay: false, accent: 'uk' };
  player.play.mockResolvedValueOnce({ ok: false, source: 'none', reason: 'sense-recording-failed', accent: 'uk' }).mockResolvedValue({ ok: true, source: 'recording', accent: 'us', senseMatch: 'matched' });
  render(<MemoryRouter initialEntries={[`/vocabulary/review?entryId=${raw.id}&senseId=${sense.id}&dueOnly=false&mode=dictation`]}><VocabularyPracticePage /></MemoryRouter>);
  const start = await screen.findByRole('button', { name: 'Start session' });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
  fireEvent.click(screen.getByRole('button', { name: 'Replay current word' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Play matching US recording' }));
  await waitFor(() => expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: raw.id }), expect.objectContaining({ accent: 'us', recording: expect.objectContaining({ accent: 'us', url: expect.any(String) }) })));
});

test('an immediate Distinction explanation is shown once', async () => {
  const user = userEvent.setup();
  fb.current.state.vocabulary[0].senses[0].distinctionTask = { prompt: 'Which means able to recover?', options: ['fragile', 'robust'], answer: 'robust', explanation: 'Robust things resist damage.' };
  fb.current.state.settings.vocabulary = { feedback: 'immediate' };
  render(<MemoryRouter initialEntries={['/vocabulary/review?mode=distinction&entryId=entry-0&dueOnly=false']}><VocabularyPracticePage /></MemoryRouter>);
  const start = await screen.findByRole('button', { name: 'Start session' });
  await waitFor(() => expect(start).toBeEnabled());
  await user.click(start);
  await user.click(await screen.findByRole('radio', { name: 'robust' }));
  await waitFor(() => expect(screen.getAllByText('Robust things resist damage.')).toHaveLength(1));
});

const plannedRecord = () => record({ id: 'planned', planId: 'plan-1', entryIds: ['entry-0'], summary: summary(1), results: [row('entry-0', 'sense-0', { term: 'resilient', definition: 'Definition 0', example: 'A resilient community.' })] });

test('a saved planned result reads its task row and does not claim the task was removed while loading', async () => {
  fb.current.state.vocabularySessions = [plannedRecord()];
  let finish!: () => void;
  fb.current.ensurePlanningRows = vi.fn(() => new Promise<void>(resolve => { finish = () => { fb.current.state.plans = [{ id: 'plan-1', status: 'completed', linkedSessionId: 'planned' }]; resolve(); }; }));
  mountHistory('planned');
  await waitFor(() => expect(fb.current.ensurePlanningRows).toHaveBeenCalledWith(['plan-1']));
  expect(screen.getByText('Checking the linked task…')).toBeInTheDocument();
  expect(screen.queryByText(/removed, skipped or changed/)).not.toBeInTheDocument();
  await act(async () => { finish(); });
  expect(await screen.findByText('Learning saved and the planned task is complete.')).toBeInTheDocument();
});

test('a failed planning read offers retry instead of a false removed-task message, and a missing row is reported once loaded', async () => {
  fb.current.state.vocabularySessions = [plannedRecord()];
  fb.current.ensurePlanningRows = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  mountHistory('planned');
  const retry = await screen.findByRole('button', { name: 'Retry loading task' });
  expect(screen.getByText(/could not be loaded, so its status is unknown/)).toBeInTheDocument();
  expect(screen.queryByText(/removed, skipped or changed/)).not.toBeInTheDocument();
  fireEvent.click(retry);
  await waitFor(() => expect(fb.current.ensurePlanningRows).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/removed, skipped or changed/)).toBeInTheDocument();
});

test('a saved result whose task is already loaded does not read planning rows again', async () => {
  fb.current.state.plans = [{ id: 'plan-1', status: 'completed', linkedSessionId: 'other' }];
  fb.current.state.vocabularySessions = [plannedRecord()];
  fb.current.ensurePlanningRows = vi.fn(async () => undefined);
  mountHistory('planned');
  expect(await screen.findByText(/already completed by another session/)).toBeInTheDocument();
  expect(fb.current.ensurePlanningRows).not.toHaveBeenCalled();
});
