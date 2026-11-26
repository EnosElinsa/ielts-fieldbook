import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FieldbookProvider, useFieldbook } from './FieldbookContext';
import { Toast } from '../components/Toast';

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: () => false,
  getSupabase: () => { throw new Error('offline'); },
}));

afterEach(() => {
  cleanup();
});

function ToastHarness() {
  const fb = useFieldbook();
  return (
    <>
      <button type="button" onClick={() => fb.toast('Copied prompt.')}>Trigger toast</button>
      <span data-testid="toast-revision">{fb.toastRevision}</span>
      <Toast message={fb.toastMessage} visible={fb.toastVisible} revision={fb.toastRevision} />
    </>
  );
}

test('repeated identical fb.toast calls increment toastRevision and reopen Toast after dismissal', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <FieldbookProvider>
        <ToastHarness />
      </FieldbookProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: 'Trigger toast' }));
  expect(screen.getByTestId('toast-revision')).toHaveTextContent('1');
  const toastEl = screen.getByRole('status').closest('#toast')!;
  expect(toastEl).toHaveClass('show');

  await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(toastEl).not.toHaveClass('show');

  // Repeating the identical message while toastVisible is still true must reopen Toast.
  await user.click(screen.getByRole('button', { name: 'Trigger toast' }));
  expect(screen.getByTestId('toast-revision')).toHaveTextContent('2');
  expect(toastEl).toHaveClass('show');
  expect(screen.getByRole('status')).toHaveTextContent('Copied prompt.');
});
