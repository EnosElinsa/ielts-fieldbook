import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WritingBankPage } from './WritingBankPage';

const { fieldbook } = vi.hoisted(() => ({ fieldbook: { current: null as any } }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => fieldbook.current }));
function Location() { return <output aria-label="Current URL">{useLocation().search}</output>; }
beforeEach(() => {
  fieldbook.current = {
    state: {
      questions: [
        { id: 'q1', name: 'Cities', prompt: 'Discuss urban life.', type: '2', format: '', source: '' },
        { id: 'q2', name: 'Education', prompt: 'Discuss education.', type: '2', format: '', source: '' },
      ],
      sessions: [{ id: 's1', questionId: 'q1', skill: 'writing' }],
      settings: { favoriteQuestions: ['writing:q2'] },
    }, toggleFavorite: vi.fn(), chooseQuestion: vi.fn(),
  };
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

test('restores URL filters and grid/list preference for the bank', () => {
  render(<MemoryRouter initialEntries={['/questions?progress=unpracticed&view=list']}><WritingBankPage /></MemoryRouter>);
  expect(screen.queryByText('Cities')).not.toBeInTheDocument();
  expect(screen.getByText('Education')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
});

test('favorite action uses persisted context and search changes the URL', async () => {
  render(<MemoryRouter><WritingBankPage /><Location /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add favourite: Cities' }));
  expect(fieldbook.current.toggleFavorite).toHaveBeenCalledWith('q1', 'writing');
  await user.type(screen.getByRole('textbox', { name: 'Search writing questions' }), 'Education');
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('?q=Education');
  expect(screen.queryByText('Cities')).not.toBeInTheDocument();
});

test('question pagination preserves filters and resets when the search changes', () => {
  fieldbook.current.state.questions = Array.from({ length: 25 }, (_, index) => ({ id: `q${index + 1}`, name: `Question ${index + 1}`, prompt: 'Discuss.', type: '2', format: '' }));
  render(<MemoryRouter initialEntries={['/questions?task=2&view=list']}><WritingBankPage /><Location /></MemoryRouter>);
  expect(screen.getAllByRole('article')).toHaveLength(12);
  fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('task=2&view=list&page=2');
  expect(screen.getByRole('heading', { name: 'Question 13' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Question 1' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search writing questions' }), { target: { value: 'Question 25' } });
  expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('page=');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Question 25' })).toBeInTheDocument();
});
