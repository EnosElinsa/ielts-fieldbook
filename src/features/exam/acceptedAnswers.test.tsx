import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { ExamAttempt, ExamCatalog, ExamQuestion } from '../../domain/exam/types';
import { ExamReviewPage } from './ExamReviewPage';

const mocks = vi.hoisted(() => ({ fb: null as any, catalog: null as unknown as ExamCatalog }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => 'answer-review-account' }));
vi.mock('./useExamCatalog', async importOriginal => ({
  ...await importOriginal<typeof import('./useExamCatalog')>(),
  useExamCatalog: () => ({ catalog: mocks.catalog, loading: false, error: '', reload: () => {} }),
}));

const provenance = { sourceUrl: 'https://example.org/source', sourceVersion: '1', fetchedAt: '2026-11-09', contentHash: 'hash', authorization: 'owned' };
const question: ExamQuestion = { id: 'q1', paperId: 'paper', sectionId: 'section', skill: 'reading', number: 1, type: 'gap', prompt: 'Store your bag in a _____.', answer: 'locker', provenance };

function review(savedQuestion: ExamQuestion, response: string | string[], liveQuestion = savedQuestion) {
  const attempt: ExamAttempt = {
    id: 'saved', skill: 'reading', sourceId: 'section', sectionIds: ['section'], mode: 'practice', status: 'completed',
    questionSnapshot: structuredClone([savedQuestion]), responses: { q1: response }, results: { q1: false },
    evidence: {}, keywords: {}, errorReasons: {}, score: 0, total: 1,
    startedAt: '2026-11-09', updatedAt: '2026-11-09', elapsedSeconds: 0, hintsEnabled: true,
  };
  const state = { examAttempts: [attempt], intensiveSessions: [], plans: [] };
  mocks.fb = { state, stateRef: { current: state } };
  mocks.catalog = { schemaVersion: 1, papers: [], sections: [], passages: [], questions: [liveQuestion], assets: [] };
  render(<MemoryRouter initialEntries={['/reading/review/saved']}><Routes><Route path="/reading/review/:attemptId" element={<ExamReviewPage skill="reading" />} /></Routes></MemoryRouter>);
}

function answerValue(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

test('review shows both explicit singular and plural answers separately from the learner response', () => {
  review({ ...question, alternatives: ['lockers', 'LOCKER'] }, 'LOKER');

  expect(answerValue('Accepted answers')).toHaveTextContent(/^locker · lockers$/);
  expect(answerValue('Your response')).toHaveTextContent(/^LOKER$/);
  expect(screen.getByLabelText('Attempt score')).toHaveTextContent('0 / 1');
});

test('answer deduplication follows grading case, Unicode, punctuation and whitespace normalization', () => {
  review({ ...question, answer: '“Engineer’s  office”', alternatives: [" engineer's office. ", 'ＥＮＧＩＮＥＥＲ’Ｓ　ＯＦＦＩＣＥ', 'engineering offices', ' ', "''"] }, 'office');

  expect(answerValue('Accepted answers').textContent).toBe('“Engineer’s  office” · engineering offices');
});

test('nonmultiple array answers and alternatives are all acceptable variants', () => {
  review({ ...question, type: 'matching', answer: ['A', 'C'], alternatives: ['D', 'a'] }, 'B');

  expect(answerValue('Accepted answers')).toHaveTextContent(/^A · C · D$/);
  expect(screen.queryByText('Correct choices', { selector: 'dt' })).not.toBeInTheDocument();
});

test('multiple-choice answers remain a required set and ignore alternatives excluded by grading', () => {
  review({ ...question, type: 'multiple', answer: ['A', 'C', 'a'], alternatives: ['B'] }, ['A']);

  expect(answerValue('Correct choices')).toHaveTextContent(/^A · C \(all required\)$/);
  expect(answerValue('Your response')).toHaveTextContent(/^A$/);
  expect(screen.getByText('Review this answer')).toBeInTheDocument();
  expect(screen.queryByText('Accepted answers', { selector: 'dt' })).not.toBeInTheDocument();
});

test('a single explicit answer does not acquire an inferred plural', () => {
  review(question, 'lockers');

  expect(answerValue('Accepted answer')).toHaveTextContent(/^locker$/);
  expect(answerValue('Your response')).toHaveTextContent(/^lockers$/);
  expect(screen.getByText('Review this answer')).toBeInTheDocument();
});

test('accepted variants come from the submitted snapshot when the live source changes', () => {
  review({ ...question, alternatives: ['lockers'] }, 'LOKER', { ...question, answer: 'cupboard', alternatives: ['cupboards'] });

  expect(answerValue('Accepted answers')).toHaveTextContent(/^locker · lockers$/);
  expect(screen.queryByText(/cupboard/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Attempt score')).toHaveTextContent('0 / 1');
});

test('an unavailable source answer retains the existing fallback', () => {
  review({ ...question, answer: '' }, 'locker');

  expect(screen.getByText('Source answer unavailable')).toBeInTheDocument();
  expect(answerValue('Your response')).toHaveTextContent(/^locker$/);
});
