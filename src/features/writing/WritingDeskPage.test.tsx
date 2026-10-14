import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { WritingDeskPage } from './WritingDeskPage';

const { persistNow, flushDraftPersist, toast, saveState } = vi.hoisted(() => ({
  persistNow: vi.fn(),
  flushDraftPersist: vi.fn(() => null),
  toast: vi.fn(),
  saveState: { status: undefined as string | undefined, owner: 'one' },
}));
vi.mock('../../storage/remote', () => ({accountId: () => saveState.owner}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    const state = emptyState();
    const selected = {
      id: '1',
      type: '2',
      name: 'Essay',
      prompt: 'Discuss.',
      image: '',
      format: 'Essay',
      source: '',
    };
    return {
      state,
      saveStatus: saveState.status,
      stateRef: { current: state },
      selectedQuestion: selected,
      currentDeskMode: () => 'full',
      writingDraft: () => '',
      speakingDraft: () => ({ parentSessionId: null }),
      wordCount: (value: string) => (String(value || '').trim() ? String(value).trim().split(/\s+/).length : 0),
      setWritingDraft: vi.fn(),
      scheduleDraftPersist: vi.fn(),
      flushDraftPersist,
      persistNow,
      toast,
      setChecklistToastNeeded: vi.fn(),
      setPendingAttempt: vi.fn(),
      openModal: vi.fn(),
      setViewedSession: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  persistNow.mockReset();
  flushDraftPersist.mockReset();
  flushDraftPersist.mockReturnValue(null);
  toast.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
  saveState.status = undefined;
  saveState.owner = 'one';
});

test('workspace tabs support arrow keys with one tab stop', async () => {
  render(<WritingDeskPage />);
  const user = userEvent.setup();
  const answer = screen.getByRole('tab', { name: 'Answer' });
  answer.focus();
  await user.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
  expect(answer).toHaveAttribute('tabindex', '-1');
  await user.keyboard('{End}');
  expect(answer).toHaveFocus();
  expect(answer).toHaveAttribute('aria-selected', 'true');
});

test('the answer panel offers a collapsible task reference without losing the draft', async () => {
  const view = render(<WritingDeskPage />);
  const answerPanel = view.container.querySelector('#writing-answer')!;
  const reference = answerPanel.querySelector('details')!;
  expect(reference).not.toBeNull();
  expect(reference.open).toBe(false);
  fireEvent.change(screen.getByRole('textbox', { name: 'Writing answer' }), { target: { value: 'My argument.' } });
  await userEvent.click(screen.getByText('Task prompt', { selector: 'summary' }));
  expect(reference.open).toBe(true);
  expect(reference).toHaveTextContent('Discuss.');
  await userEvent.click(screen.getByText('Task prompt', { selector: 'summary' }));
  expect(screen.getByRole('textbox', { name: 'Writing answer' })).toHaveValue('My argument.');
});

test('changing accounts resets writing UI and pauses the previous timer', () => {
  vi.useFakeTimers();
  const view = render(<WritingDeskPage />);
  fireEvent.click(screen.getByRole('checkbox', {name:'Position'}));
  fireEvent.click(screen.getByRole('button', {name:'Start timer'}));
  act(() => vi.advanceTimersByTime(2000));
  saveState.owner = 'two'; view.rerender(<WritingDeskPage />);
  expect(view.container.querySelector('.timer')).toHaveTextContent('40:00');
  expect(screen.getByRole('checkbox', {name:'Position'})).not.toBeChecked();
  expect(screen.getByRole('button', {name:'Start timer'})).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(5000));
  expect(view.container.querySelector('.timer')).toHaveTextContent('40:00');
});

test('writing practice returns with checks, mobile panel, and a paused remaining timer', () => {
  vi.useFakeTimers();
  const first = render(<WritingDeskPage />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Position' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => vi.advanceTimersByTime(3000));
  expect(first.container.querySelector('.timer')).toHaveTextContent('39:57');
  first.unmount();
  act(() => vi.advanceTimersByTime(60000));
  const returned = render(<WritingDeskPage />);
  expect(returned.container.querySelector('.timer')).toHaveTextContent('39:57');
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Position' })).toBeChecked();
  expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
});

test('writing countdown keeps elapsed time while the answer and save status change', () => {
  vi.useFakeTimers();
  const view = render(<WritingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  for (let index = 0; index < 16; index += 1) {
    act(() => vi.advanceTimersByTime(250));
    saveState.status = index % 2 ? 'saving' : 'saved';
    fireEvent.change(screen.getByRole('textbox', { name: 'Writing answer' }), { target: { value: `Draft ${index}` } });
  }
  expect(view.container.querySelector('.timer')).toHaveTextContent('39:56');
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(view.container.querySelector('.timer')).toHaveTextContent('39:56');
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => vi.advanceTimersByTime(1000));
  expect(view.container.querySelector('.timer')).toHaveTextContent('39:55');
});

test('writing countdown catches up after delayed ticks and completes only once', () => {
  vi.useFakeTimers();
  const view = render(<WritingDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  vi.setSystemTime(Date.now() + 2400000);
  fireEvent(document, new Event('visibilitychange'));
  act(() => vi.advanceTimersByTime(1000));
  expect(view.container.querySelector('.timer')).toHaveTextContent('0:00');
  expect(toast).toHaveBeenCalledExactlyOnceWith('Time is up. Check the answer.');
  act(() => vi.advanceTimersByTime(5000));
  expect(toast).toHaveBeenCalledTimes(1);
});

test('failed save status exposes the existing draft save action as a retry', async () => {
  saveState.status = 'failed';
  persistNow.mockResolvedValue(true);
  render(<WritingDeskPage />);
  expect(screen.getByRole('status')).toHaveTextContent('Draft could not be saved');
  await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(persistNow).toHaveBeenCalledWith(undefined, { collections: ['drafts'] });
  expect(toast).toHaveBeenCalledWith('Draft saved.');
});

test('undo and redo restore the plain text draft and discard a superseded redo branch', async () => {
  render(<WritingDeskPage />);
  const input = screen.getByRole('textbox', { name: 'Writing answer' });
  fireEvent.change(input, { target: { value: 'First draft' } });
  fireEvent.change(input, { target: { value: 'Second draft' } });
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(input).toHaveValue('First draft');
  await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(input).toHaveValue('Second draft');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input).toHaveValue('First draft');
  fireEvent.keyDown(input, { key: 'z', metaKey: true, shiftKey: true });
  expect(input).toHaveValue('Second draft');
  fireEvent.keyDown(input, { key: 'z', metaKey: true });
  fireEvent.change(input, { target: { value: 'Replacement draft' } });
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('focus mode is reversible and the panel width preference survives remounting', async () => {
  const view = render(<WritingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }));
  expect(view.container.querySelector('.focus-workspace')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }));
  expect(view.container.querySelector('.focus-workspace')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(view.container.querySelector('.focus-workspace')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('slider', { name: 'Prompt panel width' }), { target: { value: '48' } });
  expect(localStorage.getItem('fieldbook.writingSplit')).toBe('48');
  view.unmount();
  render(<WritingDeskPage />);
  expect(screen.getByRole('slider', { name: 'Prompt panel width' })).toHaveValue('48');
});

test('Save draft toasts only after the account write succeeds', async () => {
  persistNow.mockResolvedValue(false);
  render(<WritingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).not.toHaveBeenCalledWith('Draft saved.');
  persistNow.mockResolvedValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).toHaveBeenCalledWith('Draft saved.');
});
