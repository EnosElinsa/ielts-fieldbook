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

test('writing Finished names the essay file and keeps both save buttons', async () => {
  render(<SaveModal />);
  expect(
    screen.getByText('This file is the essay to score. Score it outside Fieldbook, then import the scored file.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save and export' }).className).toContain('primary');
  expect(screen.getByRole('button', { name: 'Save only' }).className).toContain('line');
  expect(screen.queryByRole('button', { name: 'Import score' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save only' }));
  expect(saveAttempt).toHaveBeenCalledWith(false, { focus: '', next: '', errors: '' });
});

test('speaking Finished says the recording is not inside the file', () => {
  pending.skill = 'speaking';
  render(<SaveModal />);
  expect(
    screen.getByText(
      'This file is what you said. The recording is not inside the file. Score it outside Fieldbook, then import the scored file.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/in this browser/)).not.toBeInTheDocument();
});
