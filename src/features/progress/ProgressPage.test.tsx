import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ProgressPage } from './ProgressPage';
const mock = vi.hoisted(() => ({ readPlans: vi.fn(), owner: 'account-one', state: { sessions: [] as any[], assessments: [] as any[], plans: [] as any[], settings: {} } }));
vi.mock('../../storage/progressPlans', () => ({ loadProgressPlans: (...args: unknown[]) => mock.readPlans(...args) }));
vi.mock('../../storage/accountIdentity', () => ({ accountId: () => mock.owner, accountGeneration: () => 1 }));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({activeSkill:'writing',state:mock.state})}));
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: any) => children, LineChart: ({ children, data }: any) => <div><output aria-label="Chart points">{(data || []).map((point: any) => point.label).join(' | ')}</output>{children}</div>, CartesianGrid: () => null, Line: () => null, ReferenceLine: () => null, Tooltip: ({ labelFormatter }: any) => <output aria-label="Tooltip label">{labelFormatter?.('ignored', [{ payload: { attempt: 1, label: '13 Oct, 11:00' } }])}</output>, XAxis: ({ dataKey, tickFormatter }: any) => <output aria-label="X axis">{dataKey}: {tickFormatter?.('13 Oct, 11:00')}</output>, YAxis: ({ ticks }: any) => <output aria-label="Y axis">{(ticks || []).join(',')}</output> }));
vi.mock('../vocabulary/VocabularyPages',()=>({VocabularyProgressPage:({since}: {since?: number})=> <div>Vocabulary evidence panel<output aria-label="Vocabulary range">{since}</output></div>}));
beforeEach(() => { mock.owner = 'account-one'; mock.state.sessions = []; mock.state.assessments = []; mock.state.plans = []; mock.readPlans.mockReset().mockImplementation(async () => ({ plans: mock.state.plans, total: mock.state.plans.length, offset: 0, limit: 20 })); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Location(){return <output>{useLocation().search}</output>}
test('legacy vocabulary category opens vocabulary and selector persists category',()=>{
render(<MemoryRouter initialEntries={['/progress?category=vocabulary']}><ProgressPage/><Location/></MemoryRouter>);
expect(screen.getByText('Vocabulary evidence panel')).toBeInTheDocument();
fireEvent.click(screen.getByRole('combobox', { name: 'Progress skill'}));fireEvent.click(screen.getByRole('option',{name:'Speaking'}));
expect(screen.getByText('?category=speaking')).toBeInTheDocument();
});

test('vocabulary category hides task filters and passes the selected range to activity', () => {
  render(<MemoryRouter initialEntries={['/progress?category=vocabulary']}><ProgressPage /></MemoryRouter>);
  expect(screen.queryByRole('combobox', { name: 'Task or part' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review vocabulary' })).toHaveAttribute('href', '/vocabulary/review');
  fireEvent.click(screen.getByRole('combobox', { name: 'Time range' }));
  fireEvent.click(screen.getByRole('option', { name: 'All time' }));
  expect(screen.getByLabelText('Vocabulary range')).toHaveTextContent('0');
});

test('speaking progress opens speaking attempts regardless of the active workspace', () => {
  render(<MemoryRouter initialEntries={['/progress?category=speaking']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Review attempts' })).toHaveAttribute('href', '/review?skill=speaking');
});

test('feedback in the selected range retains the task and mode of an older source attempt', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12));
  mock.state.sessions = [{ id: 'old', skill: 'writing', type: '2', date: '2026-06-01', practiceMode: 'timed' }];
  mock.state.assessments = [{ id: 'score', sessionId: 'old', date: '2026-10-13', overall: '6.5' }];
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=7&task=2']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'View feedback' })).toHaveAttribute('href', '/review/score');
  expect(screen.getByRole('heading', { name: 'Daily practice' })).toBeInTheDocument();
  expect(document.querySelectorAll('.week-bar')).toHaveLength(7);
});

test('the band trend is dated on the x-axis with whole-band ticks from 0 to 9', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12));
  mock.state.sessions = [{ id: 'old', skill: 'writing', type: '2', date: '2026-10-01', practiceMode: 'timed' }];
  mock.state.assessments = [{ id: 'score', sessionId: 'old', date: new Date(2026, 9, 13, 11).toISOString(), overall: '6.5' }];
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=30&task=2']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByLabelText('X axis')).toHaveTextContent('label: 13 Oct');
  expect(screen.getByLabelText('X axis')).not.toHaveTextContent('11:00');
  expect(screen.getByLabelText('Chart points')).toHaveTextContent('13 Oct, 11:00');
  expect(screen.getByLabelText('Y axis')).toHaveTextContent('0,1,2,3,4,5,6,7,8,9');
  expect(screen.getByLabelText('Tooltip label')).toHaveTextContent('Attempt 1 · 13 Oct, 11:00');
});

test('skipped study tasks have a visible status and can be selected in the status filter', async () => {
  mock.state.plans = [{ id: 'skip', title: 'Skipped essay task', skill: 'writing', kind: '2', dateKey: '2026-10-13', status: 'skipped' }];
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  expect(await screen.findByText('Skipped')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('combobox', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Skipped' }));
  expect(await screen.findByText('Skipped essay task')).toBeInTheDocument();
});

test('direct entry loads historical plans without a prior Planning History visit', async () => {
  mock.readPlans.mockResolvedValue({ plans: [{ id: 'old-plan', title: 'Completed historical overview', dateKey: '2026-10-13', status: 'completed' }], total: 1, offset: 0, limit: 20 });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  expect(await screen.findByText('Completed historical overview')).toBeInTheDocument();
  expect(mock.state.plans).toEqual([]);
});

test('a plan read failure is retryable rather than claiming that history is empty', async () => {
  mock.readPlans.mockRejectedValueOnce(new Error('History is offline')).mockResolvedValueOnce({ plans: [{ id: 'recovered', title: 'Recovered plan', dateKey: '2026-10-13', status: 'completed' }], total: 1, offset: 0, limit: 20 });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('History is offline');
  expect(screen.queryByText('No plans in this range.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry plans' }));
  expect(await screen.findByText('Recovered plan')).toBeInTheDocument();
});

test('returning to a previously failed status can show a successful fresh read', async () => {
  mock.readPlans.mockRejectedValueOnce(new Error('History is offline')).mockResolvedValue({ plans: [{ id: 'back', title: 'Fresh history', dateKey: '2026-10-13', status: 'completed' }], total: 1, offset: 0, limit: 20 });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('combobox', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Completed' }));
  await screen.findByText('Fresh history');
  fireEvent.click(screen.getByRole('combobox', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Any status' }));
  expect(await screen.findByText('Fresh history')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('plan pagination stays bounded and a new status starts from the first page', async () => {
  mock.readPlans.mockImplementation(async ({ offset, status }) => ({ plans: [{ id: `page-${offset}`, title: `${status} history ${offset}`, dateKey: '2026-10-13', status: 'completed' }], total: 41, offset, limit: 20 }));
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByText('all history 0');
  expect(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-disabled', 'true');
  const nextPage = screen.getByRole('button', { name: 'Next page' });
  nextPage.focus();
  fireEvent.click(nextPage);
  await screen.findByText('all history 20');
  expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20, limit: 20 }));
  expect(nextPage).toHaveFocus();
  fireEvent.click(screen.getByRole('combobox', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Completed' }));
  await screen.findByText('completed history 0');
  expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, status: 'completed' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Time range' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Last 7 days' }));
  await waitFor(() => expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, status: 'completed', from: expect.any(String) })));
  expect(mock.state.plans).toEqual([]);
});

test.each([0, 20])('a successful empty page with a reduced total of %s returns to the first page', async total => {
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'first', title: 'Initial history', dateKey: '2026-10-13', status: 'pending' }], total: 21 });
  mock.readPlans.mockResolvedValueOnce({ plans: [], total });
  mock.readPlans.mockResolvedValueOnce({ plans: total ? [{ id: 'remaining', title: 'Remaining history', dateKey: '2026-10-13', status: 'pending' }] : [], total });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByText('Initial history');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText(total ? 'Remaining history' : 'No plans in this range.');
  expect(mock.readPlans).toHaveBeenCalledTimes(3);
  expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
  expect(screen.queryByRole('navigation', { name: 'Study plan pages' })).not.toBeInTheDocument();
});

test('a reduced total clamps to the last valid page while pagination remains visible', async () => {
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'first', title: 'First page', dateKey: '2026-10-13', status: 'pending' }], total: 41 });
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'second', title: 'Second page', dateKey: '2026-10-13', status: 'pending' }], total: 41 });
  mock.readPlans.mockResolvedValueOnce({ plans: [], total: 21 });
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'last', title: 'Last valid page', dateKey: '2026-10-13', status: 'pending' }], total: 21 });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByText('First page');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('Second page');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('Last valid page');
  expect(screen.getByText('Page 2 of 2 · 21 plans')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
  expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
});

test.each(['Retry plans', 'First page'])('a rejected later page can recover through %s without repeating an invalid offset', async action => {
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'first', title: 'Initial history', dateKey: '2026-10-13', status: 'pending' }], total: 21 });
  mock.readPlans.mockRejectedValueOnce({ code: 'PGRST103', message: 'Requested range not satisfiable' });
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'remaining', title: 'Remaining history', dateKey: '2026-10-13', status: 'pending' }], total: 20 });
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByText('Initial history');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByRole('alert');
  expect(mock.readPlans).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: action }));
  await screen.findByText('Remaining history');
  expect(mock.readPlans).toHaveBeenCalledTimes(3);
  expect(mock.readPlans).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
});

test('a late previous-account response cannot replace the current account history', async () => {
  let finishPrevious!: (value: unknown) => void;
  mock.readPlans.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }));
  const ui = <MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>;
  const view = render(ui);
  mock.owner = 'account-two';
  mock.readPlans.mockResolvedValueOnce({ plans: [{ id: 'current', title: 'Current account history', dateKey: '2026-10-13', status: 'completed' }], total: 1, offset: 0, limit: 20 });
  view.rerender(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  await screen.findByText('Current account history');
  finishPrevious({ plans: [{ id: 'previous', title: 'Previous account history', dateKey: '2026-10-13', status: 'completed' }], total: 1, offset: 0, limit: 20 });
  await Promise.resolve();
  expect(screen.queryByText('Previous account history')).not.toBeInTheDocument();
  expect(screen.getByText('Current account history')).toBeInTheDocument();
});
