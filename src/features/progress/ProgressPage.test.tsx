import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ProgressPage } from './ProgressPage';
const mock = vi.hoisted(() => ({ state: { sessions: [] as any[], assessments: [] as any[], plans: [] as any[], settings: {} } }));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({activeSkill:'writing',state:mock.state})}));
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: any) => children, LineChart: ({ children }: any) => <div>{children}</div>, CartesianGrid: () => null, Line: () => null, ReferenceLine: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));
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

test('skipped study tasks have a visible status and can be selected in the status filter', () => {
  mock.state.plans = [{ id: 'skip', title: 'Skipped essay task', skill: 'writing', kind: '2', dateKey: '2026-10-13', status: 'skipped' }];
  render(<MemoryRouter initialEntries={['/progress?category=writing&range=all']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByText('Skipped')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Plan status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Skipped' }));
  expect(screen.getByText('Skipped essay task')).toBeInTheDocument();
});
