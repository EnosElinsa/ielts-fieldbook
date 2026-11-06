import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ProgressPage } from './ProgressPage';
const mock = vi.hoisted(() => ({ state: { sessions: [] as any[], assessments: [] as any[], plans: [] as any[], settings: {} } }));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({activeSkill:'writing',state:mock.state})}));
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: any) => children, LineChart: ({ children, data }: any) => <div><output aria-label="Chart points">{(data || []).map((point: any) => point.label).join(' | ')}</output>{children}</div>, CartesianGrid: () => null, Line: () => null, ReferenceLine: () => null, Tooltip: ({ labelFormatter }: any) => <output aria-label="Tooltip label">{labelFormatter?.('ignored', [{ payload: { attempt: 1, label: '13 Oct, 11:00' } }])}</output>, XAxis: ({ dataKey, tickFormatter }: any) => <output aria-label="X axis">{dataKey}: {tickFormatter?.('13 Oct, 11:00')}</output>, YAxis: ({ ticks }: any) => <output aria-label="Y axis">{(ticks || []).join(',')}</output> }));
vi.mock('../vocabulary/VocabularyPages',()=>({VocabularyProgressPage:({since}: {since?: number})=> <div>Vocabulary evidence panel<output aria-label="Vocabulary range">{since}</output></div>}));
beforeEach(() => { mock.state.sessions = []; mock.state.assessments = []; mock.state.plans = []; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Location(){return <output>{useLocation().search}</output>}
test('legacy vocabulary category opens vocabulary and selector persists category',()=>{
render(<MemoryRouter initialEntries={['/progress?category=vocabulary']}><ProgressPage/><Location/></MemoryRouter>);
expect(screen.getByText('Vocabulary evidence panel')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button',{name:'Progress skill'}));fireEvent.click(screen.getByRole('option',{name:'Speaking'}));
expect(screen.getByText('?category=speaking')).toBeInTheDocument();
});

test('vocabulary category hides task filters and passes the selected range to activity', () => {
  render(<MemoryRouter initialEntries={['/progress?category=vocabulary']}><ProgressPage /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: 'Task or part' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review vocabulary' })).toHaveAttribute('href', '/vocabulary/review');
  fireEvent.click(screen.getByRole('button', { name: 'Time range' }));
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

test('skipped study tasks have a visible status and can be selected in the status filter', () => {
  mock.state.plans = [{ id: 'skip', title: 'Skipped essay task', skill: 'writing', kind: '2', dateKey: '2026-10-13', status: 'skipped' }];
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByText('Skipped')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Skipped' }));
  expect(screen.getByText('Skipped essay task')).toBeInTheDocument();
});
