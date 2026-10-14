import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AssessmentDetailPage } from './AssessmentDetailPage';
const mock = vi.hoisted(() => ({ fb: {
  state: { assessments: [{ id: 'a', skill: 'speaking', sessionId: 's', date: '2026-10-13', overall: '6' }],
    sessions: [{ id: 's', skill: 'speaking', questionId: 'topic', name: 'Original answer', essay: 'Original', date: '2026-10-12' }, { id: 'r', skill: 'speaking', questionId: 'topic', name: 'Retake', essay: 'Improved', parentSessionId: 's', date: '2026-10-13' }],
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
