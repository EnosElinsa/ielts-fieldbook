import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReviewPage } from './ReviewPage';

const { mockFieldbook } = vi.hoisted(() => ({ mockFieldbook: { current: null as any } }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mockFieldbook.current }));

beforeEach(() => {
  sessionStorage.clear();
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

test('review returns with its saved search and status filter', async () => {
  const first = mount();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', {name:'Search attempts'}), 'Cities');
  await user.click(screen.getByRole('button', {name:'Attempt status'}));
  await user.click(screen.getByRole('option', {name:'Awaiting feedback'}));
  first.unmount();
  mount();
  expect(screen.getByRole('textbox', {name:'Search attempts'})).toHaveValue('Cities');
  expect(screen.getByRole('button', {name:'Attempt status'})).toHaveTextContent('Awaiting feedback');
  expect(screen.queryByText('Education essay')).not.toBeInTheDocument();
});
afterEach(cleanup);
const mount = (route = '/review') => render(<MemoryRouter initialEntries={[route]}><Routes><Route path="/review" element={<ReviewPage />} /><Route path="/reading/review" element={<p>Reading review queue</p>} /><Route path="/listening/review" element={<p>Listening review queue</p>} /></Routes></MemoryRouter>);

test('route skill selects speaking attempts when the saved skill is writing', () => {
  mockFieldbook.current.state.sessions.push({ id: 'speaking', name: 'Part two answer', skill: 'speaking', questionId: 'topic', date: '2026-10-10T12:00:00Z', essay: 'Answer', words: 85 });
  mockFieldbook.current.state.speakingTopics.push({ id: 'topic', title: 'A trip' });
  mount('/review?skill=speaking');
  expect(screen.getByText('Part two answer')).toBeInTheDocument();
  expect(screen.queryByText('Cities essay')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Transcript' })).toBeInTheDocument();
});

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

test('reading skill dispatches to the receptive review queue and excludes writing feedback', () => {
  mount('/review?skill=reading');
  expect(screen.getByText('Reading review queue')).toBeInTheDocument();
  expect(screen.queryByText('Cities essay')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Import feedback' })).not.toBeInTheDocument();
});

test('listening skill dispatches to the receptive review queue', () => {
  mount('/review?skill=listening');
  expect(screen.getByText('Listening review queue')).toBeInTheDocument();
});
