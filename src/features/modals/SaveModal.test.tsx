import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { SaveModal } from './SaveModal';

const { saveAttempt, closeModal, setPendingAttempt, pending } = vi.hoisted(() => ({
  saveAttempt: vi.fn(),
  closeModal: vi.fn(),
  setPendingAttempt: vi.fn(),
  pending: { skill: 'writing' as string },
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => ({
    modal: 'save',
    pendingAttempt: pending,
    saveAttempt,
    closeModal,
    setPendingAttempt,
  }),
}));

afterEach(() => {
  cleanup();
  saveAttempt.mockReset();
  closeModal.mockReset();
  setPendingAttempt.mockReset();
  pending.skill = 'writing';
});

test('writing save dialog explains export and keeps both save buttons', async () => {
  render(<SaveModal />);
  expect(
    screen.getByText('Save your response, or export it for feedback and import the marked file when it is ready.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save and export' }).className).toContain('primary');
  expect(screen.getByRole('button', { name: 'Save only' }).className).toContain('line');
  expect(screen.queryByRole('button', { name: 'Import score' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save only' }));
  expect(saveAttempt).toHaveBeenCalledWith(false, { focus: '', next: '', errors: '' }, { onError: expect.any(Function) });
});

test('speaking save dialog explains that recordings are excluded from export', () => {
  pending.skill = 'speaking';
  render(<SaveModal />);
  expect(
    screen.getByText(
      'Save your transcript, or export it for feedback. The export does not include your recording. Import the marked file when it is ready.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/in this browser/)).not.toBeInTheDocument();
});

test('pending practice completion blocks every dismissal and preserves notes after failure', async () => {
  let finish!: (value: boolean) => void;
  saveAttempt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const user = userEvent.setup(); render(<SaveModal />);
  await user.type(screen.getByPlaceholderText('For example: overview, comparisons, paragraph order'), 'Use clearer comparisons');
  await user.click(screen.getByRole('button', { name: 'Save only' }));
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(closeModal).not.toHaveBeenCalled();
  finish(false);
  expect(await screen.findByRole('alert')).toHaveTextContent('Your work is still here');
  expect(screen.getByPlaceholderText('For example: overview, comparisons, paragraph order')).toHaveValue('Use clearer comparisons');
});
