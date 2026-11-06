import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AssessmentDetailPage } from './AssessmentDetailPage';
const mock = vi.hoisted(() => ({ fb: {
  state: { assessments: [{ id: 'a', skill: 'speaking', sessionId: 's', date: '2026-10-13', overall: '6' }, { id: 'w', skill: 'writing', sessionId: 'ws', task: 'Task 2', date: '2026-10-03T09:00:00.000Z', overall: '6.0', editRows: [{ original: 'a', revised: 'b', reason: 'c', tag: 'TR-DEVELOP' }] }],
    sessions: [{ id: 's', skill: 'speaking', questionId: 'topic', name: 'Original answer', essay: 'Original', date: '2026-10-12' }, { id: 'r', skill: 'speaking', questionId: 'topic', name: 'Retake', essay: 'Improved', parentSessionId: 's', date: '2026-10-13' }, { id: 'ws', skill: 'writing', questionId: '1343', name: 'C21T1 社会类', essay: 'Housing essay', words: 2, date: '2026-10-02' }],
    speakingTopics: [{ id: 'topic', title: 'A trip' }] },
  startTargetedPractice: vi.fn(), downloadFile: vi.fn(), buildSpeakingAssessmentRequest: vi.fn(() => 'Retake request'), openFeedbackImport: vi.fn(), toast: vi.fn(),
} }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mock.fb }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test('speaking feedback returns to speaking review and exports the latest unmarked retake', async () => {
  render(<MemoryRouter initialEntries={['/review/a']}><Routes><Route path="/review/:id" element={<AssessmentDetailPage />} /></Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Back to review' })).toHaveAttribute('href', '/review?skill=speaking');
  await userEvent.click(screen.getByRole('button', { name: 'Request feedback for retake' }));
  expect(mock.fb.buildSpeakingAssessmentRequest).toHaveBeenCalledWith(mock.fb.state.sessions[1], mock.fb.state.speakingTopics[0]);
  expect(mock.fb.downloadFile).toHaveBeenCalledWith('ielts-assessment-request-r.md', 'Retake request', 'text/markdown');
});

const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/review/:id" element={<AssessmentDetailPage />} /></Routes></MemoryRouter>);

test('the score report title uses the translated session name and the header shows only the date', () => {
  const view = show('/review/w');
  expect(screen.getByRole('heading', { level: 2, name: 'C21T1 Society' })).toBeInTheDocument();
  expect(view.container.querySelector('.page-tools p')).not.toHaveTextContent('Overall');
  expect(screen.getByText('Overall band')).toBeInTheDocument();
  expect(screen.getByText('TR-DEVELOP')).toHaveClass('edit-tag');
});

test('an unknown score id explains the account boundary and links back to review', () => {
  show('/review/missing');
  expect(screen.getByRole('heading', { name: "This score report isn't in your account" })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to review' })).toHaveAttribute('href', '/review');
});
