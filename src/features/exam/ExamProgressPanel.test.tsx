import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamProgressPanel } from './ExamProgressPanel';
import { progressRangeStart } from '../progress/practiceActivity';
const mock = vi.hoisted(() => ({ state: { examAttempts: [] as any[], intensiveSessions: [], plans: [] } }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: mock.state }) }));
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
