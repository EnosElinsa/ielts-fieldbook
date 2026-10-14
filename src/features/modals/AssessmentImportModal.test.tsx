import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AssessmentImportModal } from './AssessmentImportModal';

const mock = vi.hoisted(() => ({ owner: 'one', fb: { modal: 'assessment', importFeedback: vi.fn(), closeModal: vi.fn(), navigate: vi.fn(), toast: vi.fn() } }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mock.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mock.owner }));
beforeEach(() => { vi.clearAllMocks(); mock.owner = 'one'; });
afterEach(cleanup);

test('failed file import retains content and original filename for retry', async () => {
  const user = userEvent.setup();
  mock.fb.importFeedback.mockResolvedValueOnce({ saved: false }).mockResolvedValueOnce({ saved: true, assessment: { id: 'score' } });
  render(<AssessmentImportModal />);
  await user.upload(document.querySelector('input[type=file]')!, new File(['Feedback text'], 'marked-essay.md', { type: 'text/markdown' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.getByRole('textbox', { name: 'Feedback text' })).toHaveValue('Feedback text');
  expect(mock.fb.navigate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retry import' }));
  await waitFor(() => expect(mock.fb.navigate).toHaveBeenCalledWith('/review/score'));
  expect(mock.fb.importFeedback).toHaveBeenLastCalledWith('Feedback text', 'marked-essay.md');
});

test('pending import cannot be dismissed or submit twice and a changed account cannot navigate', async () => {
  let resolve!: (value: unknown) => void;
  mock.fb.importFeedback.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const user = userEvent.setup();
  render(<AssessmentImportModal />);
  await user.type(screen.getByRole('textbox', { name: 'Feedback text' }), 'Marked text');
  await user.click(screen.getByRole('button', { name: 'Import feedback' }));
  expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Feedback text' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(mock.fb.closeModal).not.toHaveBeenCalled();
  mock.owner = 'two';
  resolve({ saved: true, assessment: { id: 'score' } });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Feedback text' })).not.toBeDisabled());
  expect(mock.fb.navigate).not.toHaveBeenCalled();
});
