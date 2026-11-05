import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { BackupModal } from './BackupModal';

const { closeModal, setPendingBackup, validateBackup } = vi.hoisted(() => ({
  closeModal: vi.fn(),
  setPendingBackup: vi.fn(),
  validateBackup: vi.fn(() => ({ valid: true, counts: { sessions: 12, assessments: 3, vocabulary: 1240, stories: 2, errors: 5, plans: 7 } })),
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => ({
    modal: 'backup',
    pendingBackup: { backupMeta: { origin: 'https://fieldbook.example', exportedAt: '2026-10-14T11:23:00.000Z' } },
    validateBackup,
    closeModal,
    setPendingBackup,
  }),
}));

afterEach(() => {
  cleanup();
  closeModal.mockReset();
  setPendingBackup.mockReset();
});

test('backup dialog describes a non-destructive import and previews the backup', () => {
  render(<BackupModal />);
  const dialog = screen.getByRole('dialog', { name: 'Import a backup' });
  expect(dialog).toHaveAccessibleDescription('Import study records into your account without deleting existing records.');
  expect(within(dialog).getByText('https://fieldbook.example')).toBeInTheDocument();
  for (const [label, count] of [['Attempts', '12'], ['Scores', '3'], ['Vocabulary', '1240'], ['Stories', '2'], ['Mistakes', '5'], ['Plans', '7']]) {
    expect(within(dialog).getByText(`${label}:`, { exact: false }).querySelector('strong')).toHaveTextContent(count);
  }
  expect(within(dialog).getByRole('checkbox', { name: 'Also import study settings' })).not.toBeChecked();
});

test('cancelling the backup import clears the pending backup and closes the dialog', async () => {
  render(<BackupModal />);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(setPendingBackup).toHaveBeenCalledWith(null);
  expect(closeModal).toHaveBeenCalledOnce();
});
