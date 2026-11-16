import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamProgressPanel } from './ExamProgressPanel';
import { progressRangeStart } from '../progress/practiceActivity';
const mock = vi.hoisted(() => ({ state: { examAttempts: [] as any[], intensiveSessions: [] as any[], plans: [] }, catalog: null as any, error: '', reload: vi.fn() }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: mock.state }) }));
vi.mock('./useExamCatalog', async importOriginal => ({ ...await importOriginal<typeof import('./useExamCatalog')>(), useExamCatalog: () => ({ catalog: mock.catalog, loading: false, error: mock.error, reload: mock.reload }) }));
beforeEach(() => {
  mock.state = { examAttempts: [], intensiveSessions: [], plans: [] }; mock.error = ''; mock.reload.mockReset();
  mock.catalog = { papers: [{ id: 'paper', book: 11, test: 4 }], sections: [{ id: 'source:1000', paperId: 'paper', title: 'Part 1', sentences: [{ id: 's1' }, { id: 's2' }] }] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
test('reading accuracy covers the complete selected range and excludes future attempts', () => {
  vi.useFakeTimers(); const now = new Date(2026, 9, 14, 12); vi.setSystemTime(now);
  mock.state.examAttempts = ['2026-08-01', '2026-10-13', '2026-10-15'].map((date, index) => ({ id: `a${index}`, skill: 'reading', mode: 'practice', status: 'completed', startedAt: date, completedAt: date, total: 10, score: 6, elapsedSeconds: 60 }));
  render(<MemoryRouter><ExamProgressPanel skill="reading" since={progressRangeStart('90', now)} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Weekly accuracy' })).toBeInTheDocument();
  expect(document.querySelectorAll('.week-bar')).toHaveLength(13);
  expect(screen.getAllByRole('link', { name: 'Review attempt' })).toHaveLength(2);
  expect(Array.from(document.querySelectorAll('.week-bar strong')).filter(row => row.textContent === '6/10')).toHaveLength(2);
});
test('attempt history shows study time in minutes and the panel adds no second bank link', () => {
  mock.state.examAttempts = [[480, 'a'], [20, 'b'], [0, 'c']].map(([seconds, id]) => ({ id, skill: 'listening', mode: 'practice', status: 'completed', startedAt: '2026-10-13', completedAt: '2026-10-13', total: 10, score: 6, elapsedSeconds: seconds }));
  render(<MemoryRouter><ExamProgressPanel skill="listening" /></MemoryRouter>);
  const times = Array.from(document.querySelectorAll('.progress-section table tbody tr')).map(row => row.children[3].textContent);
  expect(times.sort()).toEqual(['1 min', '8 min', '—']);
  expect(screen.queryByRole('link', { name: /Open listening bank/ })).not.toBeInTheDocument();
  expect(screen.getByText('View')).not.toHaveClass('exam-eyebrow');
  expect(screen.getByRole('combobox', { name: 'Answer support' })).toBeInTheDocument();
});

test('due sentences show their actual source and explain why old work appears outside the selected range', () => {
  mock.state.intensiveSessions = [{ id: 'due', sectionId: 'source:1000', sentenceId: 's2', stage: 6, completedAt: '2020-01-01', nextReviewAt: '2020-01-02', dictationResult: 'partial', replayCount: 2 }];
  render(<MemoryRouter><ExamProgressPanel skill="listening" since={progressRangeStart('30')} /></MemoryRouter>);
  expect(screen.getByText('Cambridge 11 / Test 4 · Part 1 · Sentence 2')).toBeInTheDocument();
  expect(screen.getByText('Last dictation: Partially correct')).toBeInTheDocument();
  expect(screen.getByText('Due reviews include all saved sentences, regardless of the date range above.')).toBeInTheDocument();
  expect(screen.queryByText(/source:1000/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sentence' })).toHaveAttribute('href', '/listening/intensive/source:1000?sentence=s2');
  expect(screen.getByRole('link', { name: 'View all sentence reviews' })).toHaveAttribute('href', '/listening/review');
});

test('missing source metadata keeps due reviews usable and offers a scoped retry', async () => {
  mock.state.intensiveSessions = [{ id: 'due', sectionId: 'source:1000', sentenceId: 's1', completedAt: '2020-01-01', nextReviewAt: '2020-01-02', dictationResult: 'wrong' }];
  mock.catalog = { papers: [], sections: [] }; mock.error = 'Offline';
  render(<MemoryRouter><ExamProgressPanel skill="listening" /></MemoryRouter>);
  expect(screen.queryByText(/source:1000/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sentence' })).toHaveAttribute('href', '/listening/intensive/source:1000?sentence=s1');
  await userEvent.click(screen.getByRole('button', { name: 'Retry source details' }));
  expect(mock.reload).toHaveBeenCalled();
});

test('reading history labels passages and keeps unavailable grades distinct from zero marks', () => {
  mock.state.examAttempts = [{ id: 'old', skill: 'reading', mode: 'practice', status: 'completed', startedAt: '2026-10-13', completedAt: '2026-10-13' }];
  render(<MemoryRouter><ExamProgressPanel skill="reading" /></MemoryRouter>);
  const row = document.querySelector('.progress-section table tbody tr')!;
  expect(row.children[1]).toHaveTextContent('Passage practice');
  expect(row.children[2]).toHaveTextContent('—');
  expect(row.children[2]).not.toHaveTextContent('0 / 0');
});
