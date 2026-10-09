import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { WritingDeskPage } from './WritingDeskPage';

const { persistNow, flushDraftPersist, toast, saveState } = vi.hoisted(() => ({
  persistNow: vi.fn(),
  flushDraftPersist: vi.fn(() => null),
  toast: vi.fn(),
  saveState: { status: undefined as string | undefined },
}));

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
  saveState.status = undefined;
});

test('failed save status exposes the existing draft save action as a retry', async () => {
  saveState.status = 'failed';
  persistNow.mockResolvedValue(true);
  render(<WritingDeskPage />);
  expect(screen.getByRole('status')).toHaveTextContent('Failed');
  await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(persistNow).toHaveBeenCalled();
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
