import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReviewPage } from './ReviewPage';

const { mockFieldbook } = vi.hoisted(() => ({ mockFieldbook: { current: null as any } }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mockFieldbook.current }));

beforeEach(() => {
  mockFieldbook.current = {
    activeSkill: 'writing',
    state: {
      sessions: [
        { id: 'pending', name: 'Cities essay', skill: 'writing', questionId: 'q1', date: '2026-10-09T12:00:00Z', essay: 'My essay', words: 250 },
        { id: 'assessed', name: 'Education essay', skill: 'writing', questionId: 'q2', date: '2026-10-08T12:00:00Z', essay: 'My second essay', words: 260, assessmentId: 'a1' },
      ],
      assessments: [{ id: 'a1', sessionId: 'assessed', skill: 'writing', date: '2026-10-09T12:00:00Z', overall: '6.5' }],
      errors: [{ id: 'e1', code: 'CC-ORG', text: 'Improve the link between paragraphs', sourceSessionId: 'assessed', date: '2026-10-09T12:00:00Z' }],
      questions: [{ id: 'q1', type: '2', prompt: 'Describe a city.' }],
      speakingTopics: [],
    },
    openFeedbackImport: vi.fn(), startTargetedPractice: vi.fn(), downloadFile: vi.fn(),
    buildAssessmentRequest: vi.fn(() => 'Assessment request'), toast: vi.fn(),
  };
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><ReviewPage /></MemoryRouter>);

test('filtering awaiting feedback hides assessed attempts while keeping feedback actions available', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Attempt status' }));
  await user.click(screen.getByRole('option', { name: 'Awaiting feedback' }));
  expect(screen.getByText('Cities essay')).toBeInTheDocument();
  expect(screen.queryByText('Education essay')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add feedback' }));
  expect(mockFieldbook.current.openFeedbackImport).toHaveBeenCalledOnce();
});

test('exports an assessment request using the source attempt and matching question', async () => {
  mount();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Download' }));
  expect(mockFieldbook.current.buildAssessmentRequest).toHaveBeenCalledWith(mockFieldbook.current.state.sessions[0], mockFieldbook.current.state.questions[0]);
  expect(mockFieldbook.current.downloadFile).toHaveBeenCalledWith('ielts-assessment-request-pending.md', 'Assessment request', 'text/markdown');
});

test('targeted practice links the source attempt and specific mistake', async () => {
  mount();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Practise this' }));
  expect(mockFieldbook.current.startTargetedPractice).toHaveBeenCalledWith(mockFieldbook.current.state.sessions[1], 'e1');
});
