import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { IntensiveWorkbenchPage } from './IntensiveWorkbenchPage';
import { createIntensiveSession } from '../../domain/exam/intensive';
import type { ExamCatalog } from '../../domain/exam/types';

const mocks = vi.hoisted(() => ({ fb: null as any, recovery: new Map<string, any>() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => 'diagnosis-owner' }));
vi.mock('../../storage/examCatalog', () => ({ loadExamSections: async () => catalog, resolveExamAsset: async () => '/audio.mp3' }));
vi.mock('../../storage/examRecovery', () => ({
  readExamRecovery: (owner: string, key: string) => mocks.recovery.get(`${owner}:${key}`),
  readExamRecoveries: () => [],
  writeExamRecovery: (owner: string, key: string, value: unknown) => mocks.recovery.set(`${owner}:${key}`, structuredClone(value)),
  clearExamRecovery: (owner: string, key: string) => mocks.recovery.delete(`${owner}:${key}`),
}));
vi.mock('../../storage/pendingAudio', () => ({ readPendingAudio: async () => null }));
vi.mock('../../components/SessionAudioPlayer', () => ({ SessionAudioPlayer: () => null }));
vi.mock('./IntensiveAudio', () => ({ IntensiveAudio: () => null }));

const provenance = { sourceUrl: 'https://example.org', sourceVersion: '1', fetchedAt: '2026-01-01', contentHash: 'hash', authorization: 'owned' };
const catalog: ExamCatalog = {
  schemaVersion: 1, papers: [], questions: [], passages: [], assets: [],
  sections: [{ id: 'part', paperId: 'paper', skill: 'listening', part: 1, title: 'Journey', questionTypes: [], questionCount: 0, status: 'ready', provenance, sentences: [{ id: 's1', text: 'The train leaves at nine.', start: 0, end: 3, alignment: 'source' }] }],
};
const compared = () => ({ ...createIntensiveSession('part', 's1', '2026-11-01T00:00:00Z'), stage: 2, listened: true, revealed: true, transcriptInput: 'The train nine.', dictationResult: 'partial' as const });
const open = () => render(<MemoryRouter><IntensiveWorkbenchPage sectionId="part" /></MemoryRouter>);
const saved = () => mocks.recovery.get('diagnosis-owner:intensive:part').s1;

beforeEach(() => {
  mocks.recovery.clear();
  const state = { intensiveSessions: [compared()] };
  mocks.fb = { state, stateRef: { current: state }, setState: vi.fn(), persistNow: vi.fn(async (draft: any) => { mocks.fb.state = draft; mocks.fb.stateRef.current = draft; return true; }) };
});
afterEach(cleanup);

test('selects causes across groups and restores Other notes without changing the recorded comparison', async () => {
  const user = userEvent.setup();
  const view = open();
  const sound = await screen.findByRole('group', { name: 'Sound recognition' });
  const language = screen.getByRole('group', { name: 'Language knowledge' });
  expect(screen.getByRole('group', { name: 'Writing' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Listening pace and attention' })).toBeInTheDocument();
  await user.click(within(sound).getByRole('checkbox', { name: 'Known word not recognized' }));
  await user.click(within(sound).getByRole('checkbox', { name: 'Word boundaries' }));
  await user.click(within(language).getByRole('checkbox', { name: 'Grammar or word endings' }));
  await user.click(screen.getByRole('checkbox', { name: 'Other' }));
  await user.type(screen.getByRole('textbox', { name: 'Diagnosis note (optional)' }), 'I lost the word boundary.');
  expect(saved()).toMatchObject({ errorReasons: ['Known word not recognized', 'Word boundaries', 'Grammar or word endings', 'Other'], errorNote: 'I lost the word boundary.', stage: 2, dictationResult: 'partial' });
  await user.click(screen.getByRole('button', { name: 'Save progress' }));
  view.unmount(); open();
  expect(await screen.findByRole('checkbox', { name: 'Word boundaries' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Grammar or word endings' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Other' })).toBeChecked();
  expect(screen.getByRole('textbox', { name: 'Diagnosis note (optional)' })).toHaveValue('I lost the word boundary.');
  await user.click(screen.getByRole('checkbox', { name: 'Other' }));
  expect(screen.getByRole('textbox', { name: 'Diagnosis note (optional)' })).toHaveValue('I lost the word boundary.');
  expect(saved().dictationResult).toBe('partial');
});

test('keeps every saved legacy reason visible and literal when another diagnosis is selected', async () => {
  const legacy = ['Connected speech', 'Weak forms', 'Vocabulary', 'Spelling', 'Attention', 'Sound changes', 'An older custom reason'];
  mocks.fb.state.intensiveSessions = [{ ...compared(), errorReasons: legacy }];
  const user = userEvent.setup(); open();
  for (const reason of legacy) expect(await screen.findByRole('checkbox', { name: reason })).toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Grammar or word endings' }));
  expect(saved().errorReasons).toEqual([...legacy, 'Grammar or word endings']);
  await user.click(screen.getByRole('checkbox', { name: 'Weak forms' }));
  expect(saved().errorReasons).toEqual([...legacy.filter(reason => reason !== 'Weak forms'), 'Grammar or word endings']);
});

test('lets a perfect dictation continue with no diagnosis and does not describe it as an error', async () => {
  mocks.fb.state.intensiveSessions = [{ ...compared(), transcriptInput: 'The train leaves at nine.', dictationResult: 'correct' }];
  const user = userEvent.setup(); open();
  expect(await screen.findByRole('group', { name: 'Listening diagnosis (optional)' })).toBeInTheDocument();
  expect(screen.queryByText('Why did you miss it?')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Continue to shadowing' }));
  expect(screen.getByRole('button', { name: 'Record shadowing' })).toBeEnabled();
  expect(mocks.fb.state.intensiveSessions[0]).toMatchObject({ dictationResult: 'correct', errorReasons: [] });
});

test('shows original reason strings and notes in previous completed cycles', async () => {
  mocks.fb.state.intensiveSessions = [{ ...compared(), stage: 4, reviewHistory: [{ gist: '', transcriptInput: 'Train nine', dictationResult: 'partial', errorReasons: ['Weak forms', 'Sound changes'], errorNote: 'I lost the word boundary.', completedAt: '2026-10-01' }] }];
  const user = userEvent.setup(); open();
  await user.click(await screen.findByText('Previous completed cycles'));
  expect(screen.getByText('Weak forms · Sound changes')).toBeVisible();
  expect(screen.getByText('I lost the word boundary.')).toBeVisible();
});

test('keeps the completed practice diagnosis available before choosing another listening review', async () => {
  mocks.fb.state.intensiveSessions = [{ ...compared(), stage: 6, completedAt: '2026-11-01', nextReviewAt: '2099-01-01', errorReasons: ['Weak forms', 'Other'], errorNote: 'The last word faded away.' }];
  const user = userEvent.setup(); open();
  await user.click(await screen.findByText('Previous practice and reviews'));
  expect(screen.getByText('Weak forms · Other')).toBeVisible();
  expect(screen.getByText('The last word faded away.')).toBeVisible();
});
