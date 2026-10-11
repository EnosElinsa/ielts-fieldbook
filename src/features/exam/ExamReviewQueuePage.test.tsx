import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamReviewQueuePage } from './ExamReviewQueuePage';
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: { examAttempts: [{ id: 'wrong', skill: 'reading', sourceId: 'paper', sectionIds: ['part'], mode: 'practice', status: 'completed', score: 1, total: 2, results: { q1: true, q2: false }, updatedAt: '2026-10-01', errorReasons: { q2: 'Missed paraphrase' } }, { id: 'listen', skill: 'listening', status: 'completed', results: {}, updatedAt: '2026-10-02' }], intensiveSessions: [], settings: {} } }) }));
vi.mock('../../storage/examCatalog', () => ({ loadExamCatalog: async () => ({ schemaVersion: 1, papers: [], sections: [{ id: 'part', paperId: 'paper', title: 'Garden', skill: 'reading' }], questions: [], assets: [], passages: [] }) }));
afterEach(cleanup);
test('reading review queue presents only reading attempts with retained wrong reasons', async () => { render(<MemoryRouter><ExamReviewQueuePage skill="reading" /></MemoryRouter>); expect(await screen.findByText('Garden')).toBeInTheDocument(); expect(screen.getByText('Missed paraphrase')).toBeInTheDocument(); expect(screen.getByRole('link', { name: /Review attempt/ })).toHaveAttribute('href', '/reading/review/wrong'); expect(screen.queryByRole('link', { name: /listen/ })).not.toBeInTheDocument(); });
