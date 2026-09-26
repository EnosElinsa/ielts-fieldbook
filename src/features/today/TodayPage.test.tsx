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

const { openModal, examDate, fieldbookState, activeSkill } = vi.hoisted(() => ({
  openModal: vi.fn(),
  examDate: { value: '' },
  fieldbookState: { current: null as ReturnType<typeof emptyState> | null },
  activeSkill: { value: 'writing' },
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    if (!fieldbookState.current) {
      fieldbookState.current = emptyState();
    }
    fieldbookState.current.settings.examDate = examDate.value;
    return {
      state: fieldbookState.current,
      activeSkill: activeSkill.value,
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
  activeSkill.value = 'writing';
  fieldbookState.current = emptyState();
});

const handoff = 'Finish one task. Export the file, score it outside Fieldbook, then import the scored file.';

test('an empty writing skill names the score file under the exam-date lead', () => {
  renderPage();
  expect(screen.getByText('The exam date is not set. Set it and the daily tasks follow the exam.')).toBeInTheDocument();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a set exam date still names the score file when nothing is saved', () => {
  examDate.value = '2026-12-01';
  renderPage();
  expect(screen.getByText(/Today.s writing is below\./)).toBeInTheDocument();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a saved writing attempt hides the score-file sentence', () => {
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'writing',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.queryByText(handoff)).not.toBeInTheDocument();
});

test('a speaking attempt does not hide the writing score-file sentence', () => {
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'speaking',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a writing attempt does not hide the speaking score-file sentence', () => {
  activeSkill.value = 'speaking';
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'writing',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.getByText(handoff)).toBeInTheDocument();
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
