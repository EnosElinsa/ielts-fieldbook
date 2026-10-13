import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState } from '../../domain';
import { TodayPage } from '../today/TodayPage';
import { ProgressPage } from '../progress/ProgressPage';
const mock = vi.hoisted(() => ({ state: null as any, skill: 'reading' }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({ state: mock.state, activeSkill: mock.skill, ensureUnifiedPlans: async () => true, startPlan: vi.fn().mockResolvedValue(true), openModal: vi.fn() }) }));
vi.mock('./useExamCatalog', () => ({ QUESTION_TYPE_NAMES: { multiple: 'Choose multiple' }, examClock: (seconds: number) => `${seconds}s`, useExamCatalog: () => ({ catalog: { papers: [], sections: [] }, loading: false, error: '', reload: vi.fn() }) }));
afterEach(cleanup);
const stamp = new Date().toISOString();
function state() { mock.state = emptyState(); mock.skill = 'reading'; return mock.state; }

test('reading progress shows weighted marks and retained type evidence without writing bands', () => {
  const data = state();
  data.examAttempts = [{ id: 'attempt', skill: 'reading', sectionIds: ['s'], status: 'completed', mode: 'practice', startedAt: stamp, completedAt: stamp, updatedAt: stamp, score: 1, total: 2, elapsedSeconds: 120, results: { q: false }, earnedPoints: { q: 1 }, questionTypes: { q: 'multiple' }, questionSnapshot: [{ id: 'q', points: 2 }], errorReasons: { q: 'Missed paraphrase' } }];
  render(<MemoryRouter initialEntries={['/progress?category=reading']}><ProgressPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Reading accuracy' })).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
  expect(screen.getByRole('row', { name: /Choose multiple.*1.*2.*50%/ })).toBeInTheDocument();
  expect(screen.queryByText('Band trend')).not.toBeInTheDocument();
  expect(screen.getByText('Missed paraphrase')).toBeInTheDocument();
});
test('unified today retains a bound due sentence regardless of the current skill', () => {
  const data = state(); mock.skill = 'listening';
  data.intensiveSessions = [{ id: 'i', sectionId: 's', sentenceId: 'line', completedAt: stamp, nextReviewAt: '2026-01-01T00:00:00Z', updatedAt: stamp, stage: 6, replayCount: 2, dictationResult: 'partial' }];
  data.plans=[{id:'due',skill:'listening',kind:'listening-intensive',dateKey:stamp.slice(0,10),status:'pending',title:'Listening - Due sentence',estimatedMinutes:20,target:{type:'intensive',sectionId:'s',sentenceId:'line'}}];
  render(<MemoryRouter><TodayPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Listening - Due sentence' })).toBeInTheDocument();
  expect(screen.queryByText(/Export the file, score it outside Fieldbook/)).not.toBeInTheDocument();
});
test('reading today resumes a paused mock using its original attempt ID', () => {
  const data = state();
  data.examAttempts = [{ id: 'paused', skill: 'reading', sourceId: 'paper', sectionIds: ['s'], mode: 'mock', status: 'paused', updatedAt: stamp }];
  render(<MemoryRouter><TodayPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/reading/mock/paper?attempt=paused');
});

test('today retains wrong-only retry scope when resuming an existing part', () => {
  const data = state();
  data.examAttempts = [{ id: 'retry', skill: 'reading', sourceId: 's', sectionIds: ['s'], mode: 'practice', status: 'paused', updatedAt: stamp, retryOfAttemptId: 'original' }];
  render(<MemoryRouter><TodayPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/reading/s?attempt=retry&retry=original');
});

test('progress keeps assisted practice and mock marks out of unassisted practice by default', () => {
  const data = state();
  const base = { skill: 'reading', sectionIds: ['s'], status: 'completed', startedAt: stamp, completedAt: stamp, updatedAt: stamp, total: 2, elapsedSeconds: 120, errorReasons: {}, results: {}, earnedPoints: {}, questionTypes: {} };
  data.examAttempts = [{ ...base, id: 'practice', mode: 'practice', score: 1 }, { ...base, id: 'supported', mode: 'practice', answerRevealed: true, score: 2 }, { ...base, id: 'mock', mode: 'mock', score: 0 }];
  render(<MemoryRouter initialEntries={['/progress?category=reading']}><ProgressPage /></MemoryRouter>);
  expect(screen.getAllByText('1 / 2')).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Answer support' }), { target: { value: 'supported' } });
  expect(screen.getAllByText('2 / 2')).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Answer support' }), { target: { value: 'unassisted' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'mock' } });
  expect(screen.getAllByText('0 / 2')).toHaveLength(2);
});
