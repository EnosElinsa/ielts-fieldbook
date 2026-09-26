import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState } from '../../domain';
import { TodayPage } from './TodayPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

const { openModal, examDate, fieldbookState } = vi.hoisted(() => ({
  openModal: vi.fn(),
  examDate: { value: '' },
  fieldbookState: { current: null as ReturnType<typeof emptyState> | null },
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    if (!fieldbookState.current) {
      fieldbookState.current = emptyState();
    }
    fieldbookState.current.settings.examDate = examDate.value;
    return {
      state: fieldbookState.current,
      activeSkill: 'writing',
      ensurePlansForSkill: () => [],
      openModal,
      setLexiconDueOnly: vi.fn(),
      setSkill: vi.fn(),
      startPlan: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  openModal.mockReset();
  examDate.value = '';
  fieldbookState.current = emptyState();
});

test('an empty exam date can open settings and the tasks stay on the page', async () => {
  renderPage();
  expect(screen.getByText('The exam date is not set. Set it and the daily tasks follow the exam.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: "Today's main task" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Set exam date' }));
  expect(openModal).toHaveBeenCalledWith('settings');
});

test('a set exam date keeps the current lead', () => {
  examDate.value = '2026-12-01';
  renderPage();
  expect(screen.queryByText('The exam date is not set. Set it and the daily tasks follow the exam.')).not.toBeInTheDocument();
  expect(screen.getByText(/Today.s writing is below\./)).toBeInTheDocument();
});
