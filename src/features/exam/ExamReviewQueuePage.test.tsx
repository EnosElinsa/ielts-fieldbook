import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamReviewQueuePage } from './ExamReviewQueuePage';
const mocks = vi.hoisted(() => ({ state: null as any, catalog: null as any, load: vi.fn(), loadSections: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: mocks.state }) }));
vi.mock('../../storage/examCatalog', () => ({ loadExamCatalog: (...args: any[]) => mocks.load(...args), loadExamSections: (...args: any[]) => mocks.loadSections(...args) }));
beforeEach(() => {
  mocks.state = { examAttempts: [
    { id: 'wrong', skill: 'reading', sourceId: 'part', sectionIds: ['part'], mode: 'practice', status: 'completed', score: 1, total: 2, results: { q1: true, q2: false }, updatedAt: '2026-10-01', errorReasons: { q2: 'Missed paraphrase' } },
    { id: 'listen', skill: 'listening', sectionIds: ['audio'], mode: 'practice', status: 'completed', results: {}, updatedAt: '2026-10-02' },
  ], intensiveSessions: [], settings: {} };
  mocks.catalog = { schemaVersion: 1, papers: [{ id: 'paper', book: 8, test: 1, title: 'Cambridge 8 Test 1' }], sections: [
    { id: 'part', paperId: 'paper', title: 'Garden', skill: 'reading', sentences: [] },
    { id: 'audio', paperId: 'paper', title: 'Part 1', skill: 'listening', sentences: [{ id: 's1' }, { id: 's2' }] },
  ], questions: [], assets: [], passages: [] };
  mocks.load.mockReset().mockImplementation(async () => mocks.catalog);
  mocks.loadSections.mockReset().mockImplementation(async (ids: string[]) => ({ ...mocks.catalog, sections: mocks.catalog.sections.filter((row: any) => ids.includes(row.id)) }));
});
afterEach(cleanup);
test('reading review queue presents only reading attempts with retained wrong reasons', async () => { render(<MemoryRouter><ExamReviewQueuePage skill="reading" /></MemoryRouter>); expect(await screen.findByText('Garden')).toBeInTheDocument(); expect(screen.getByText('Missed paraphrase')).toBeInTheDocument(); expect(screen.getByRole('link', { name: /Review attempt/ })).toHaveAttribute('href', '/reading/review/wrong'); expect(screen.queryByRole('link', { name: /listen/ })).not.toBeInTheDocument(); });

test('no wrong answers offers a direct path to completed attempts including mocks', async () => {
  mocks.state.examAttempts[0] = { ...mocks.state.examAttempts[0], mode: 'mock', sourceId: 'paper', results: { q1: true, q2: true }, score: 2 };
  render(<MemoryRouter><ExamReviewQueuePage skill="reading" /></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole('button', { name: 'View all attempts' }));
  expect(await screen.findByText('Cambridge 8 Test 1')).toBeInTheDocument();
  expect(screen.getByText('All correct')).toBeInTheDocument();
  expect(screen.getByText('Full mock')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All attempts (1)' })).toHaveAttribute('aria-pressed', 'true');
});

test('source failure preserves saved review navigation and can retry metadata', async () => {
  mocks.load.mockRejectedValueOnce(new Error('Offline'));
  render(<MemoryRouter><ExamReviewQueuePage skill="reading" /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Your saved reviews remain available');
  expect(screen.getByRole('link', { name: 'Review attempt wrong' })).toHaveAttribute('href', '/reading/review/wrong');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry source details' }));
  expect(await screen.findByText('Garden')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

test('due listening reviews identify their paper and sentence and preserve the sentence destination', async () => {
  mocks.load.mockImplementation(async () => ({ ...mocks.catalog, sections: mocks.catalog.sections.map((row: any) => ({ ...row, sentences: [] })) }));
  mocks.state.intensiveSessions = [
    { id: 'due', sectionId: 'audio', sentenceId: 's2', completedAt: '2026-01-01', nextReviewAt: '2026-01-02', errorReasons: ['Weak forms'] },
    { id: 'future', sectionId: 'audio', sentenceId: 's1', completedAt: '2026-01-01', nextReviewAt: '2099-01-02', errorReasons: [] },
  ];
  render(<MemoryRouter><ExamReviewQueuePage skill="listening" /></MemoryRouter>);
  expect(await screen.findByText('Part 1 · Sentence 2')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Cambridge 8 \/ Test 1 Part 1 · Sentence 2 Weak forms/ })).toHaveAttribute('href', '/listening/intensive/audio?sentence=s2');
  expect(screen.getByText('1 sentence due')).toBeInTheDocument();
  expect(mocks.loadSections).toHaveBeenCalledWith(['audio']);
  expect(screen.queryByText('Part 1 · Sentence 1')).not.toBeInTheDocument();
});
