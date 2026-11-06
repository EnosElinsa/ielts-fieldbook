import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

test('route skill selects speaking attempts when the saved skill is writing', async () => {
  mockFieldbook.current.state.sessions.push({ id: 'speaking', name: 'Part two answer', skill: 'speaking', questionId: 'topic', date: '2026-10-10T12:00:00Z', essay: 'Answer', words: 85 });
  mockFieldbook.current.state.speakingTopics.push({ id: 'topic', title: 'A trip' });
  mount('/review?skill=speaking');
  expect(screen.getByText('Part two answer')).toBeInTheDocument();
  expect(screen.queryByText('Cities essay')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'More actions for Part two answer' }));
  expect(await screen.findByRole('menuitem', { name: 'Transcript' })).toBeInTheDocument();
});

test('each attempt has one primary action and a band chip that opens its score report', async () => {
  const view = mount();
  const rows = [...view.container.querySelectorAll('.review-attempts > li')] as HTMLElement[];
  expect(rows).toHaveLength(2);
  rows.forEach(row => expect(row.querySelectorAll('.btn.primary')).toHaveLength(1));
  expect(within(rows[0]).getByRole('button', { name: 'Copy feedback request' })).toBeInTheDocument();
  expect(within(rows[0]).getByText('Awaiting feedback')).toBeInTheDocument();
  expect(within(rows[1]).getByRole('link', { name: /^Band 6\.5/ })).toHaveAttribute('href', '/review/a1');
  expect(within(rows[1]).getByRole('link', { name: 'Open feedback' })).toHaveAttribute('href', '/review/a1');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More actions for Cities essay' }));
  expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['Essay', 'Continue', 'Download request', 'Add feedback']);
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'More actions for Education essay' }));
  expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['Essay', 'Continue']);
});

test('copying a feedback request is the primary action for an unmarked attempt', async () => {
  mount();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Copy feedback request' }));
  expect(mockFieldbook.current.buildAssessmentRequest).toHaveBeenCalledWith(mockFieldbook.current.state.sessions[0], mockFieldbook.current.state.questions[0]);
});

test('mistakes show the revision once with one shared subtitle', () => {
  mockFieldbook.current.state.errors = [{ id: 'e2', code: 'LR-COLLOC', text: 'makes transport popular → encourages more people to use transport: natural collocation', next: 'encourages more people to use transport', sourceSessionId: 'assessed', date: '2026-10-09T12:00:00Z' }];
  mount();
  expect(screen.getByText('Corrections from your feedback. Practise each one until it sticks.')).toBeInTheDocument();
  expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();
  cleanup();
  mount('/review?skill=speaking');
  expect(screen.getByText('Corrections from your feedback. Practise each one until it sticks.')).toBeInTheDocument();
});

test('filtering awaiting feedback hides assessed attempts while keeping feedback actions available', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Attempt status' }));
  await user.click(screen.getByRole('option', { name: 'Awaiting feedback' }));
  expect(screen.getByText('Cities essay')).toBeInTheDocument();
  expect(screen.queryByText('Education essay')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'More actions for Cities essay' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Add feedback' }));
  expect(mockFieldbook.current.openFeedbackImport).toHaveBeenCalledOnce();
});

test('exports an assessment request using the source attempt and matching question', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More actions for Cities essay' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Download request' }));
  expect(mockFieldbook.current.buildAssessmentRequest).toHaveBeenCalledWith(mockFieldbook.current.state.sessions[0], mockFieldbook.current.state.questions[0]);
  expect(mockFieldbook.current.downloadFile).toHaveBeenCalledWith('ielts-assessment-request-pending.md', 'Assessment request', 'text/markdown');
});

test('targeted practice links the source attempt and specific mistake', async () => {
  mount();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Practise this' }));
  expect(mockFieldbook.current.startTargetedPractice).toHaveBeenCalledWith(mockFieldbook.current.state.sessions[1], 'e1');
});

test('reviewing and resolving mistakes save only errors, preserving unrelated drafts', async () => {
  const fb = mockFieldbook.current;
  fb.stateRef = { current: fb.state };
  fb.reviewError = vi.fn(); fb.resolveError = vi.fn();
  fb.persistNow = vi.fn().mockResolvedValue(false);
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More actions for CC-ORG' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Review once' }));
  await waitFor(() => expect(fb.persistNow).toHaveBeenCalledTimes(1));
  expect(fb.persistNow).toHaveBeenLastCalledWith(expect.any(Object), { collections: ['errors'] });
  expect(fb.toast).not.toHaveBeenCalledWith('Review saved.');
  await user.click(screen.getByRole('button', { name: 'More actions for CC-ORG' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Mark corrected myself' }));
  await waitFor(() => expect(fb.persistNow).toHaveBeenCalledTimes(2));
  expect(fb.persistNow).toHaveBeenLastCalledWith(expect.any(Object), { collections: ['errors'] });
});

test('a search with no matches can clear filters without pretending the account is empty', async () => {
  mount();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Search attempts' }), 'no match');
  expect(screen.getByText('No attempts match your filters.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('Cities essay')).toBeInTheDocument();
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

test('attempts and feedback use newest dates first regardless of database row order', () => {
  const state = mockFieldbook.current.state;
  state.assessments.push(
    { id: 'old', sessionId: null, skill: 'writing', task: 'Task 1', date: '2026-10-01T12:00:00Z', overall: '6' },
    { id: 'new', sessionId: 'deleted', skill: 'writing', task: 'Task 2', date: '2026-10-05T12:00:00Z', overall: '7' },
  );
  const view = mount();
  expect([...view.container.querySelectorAll('.review-attempts h4')].map(node => node.textContent)).toEqual(['Cities essay', 'Education essay']);
  expect(screen.getByRole('heading', { name: 'Feedback without a saved attempt' })).toBeInTheDocument();
  expect([...view.container.querySelectorAll('.review-unlinked h4')].map(node => node.textContent)).toEqual(['Task 2', 'Task 1']);
  expect(within(view.container.querySelector('.review-unlinked')!).getByRole('link', { name: /^Band 7\.0/ })).toHaveAttribute('href', '/review/new');
});

test('pasted search text ignores surrounding whitespace', async () => {
  mount();
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search attempts' }), '  Cities  ');
  expect(screen.getByText('Cities essay')).toBeInTheDocument();
  expect(screen.queryByText('Education essay')).not.toBeInTheDocument();
});
