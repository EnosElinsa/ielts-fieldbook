import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { SaveFailure } from './SaveFailure';

afterEach(cleanup);

test('the failed save line stays only while the flag is set', () => {
  const { rerender } = render(<SaveFailure failed />);
  expect(screen.getByRole('status')).toHaveTextContent('Could not save to your account. Try again.');
  rerender(<SaveFailure failed={false} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('offers a real retry and prevents duplicate retries while saving', async () => {
  const retry = vi.fn();
  const { rerender } = render(<SaveFailure failed onRetry={retry} />);
  await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(<SaveFailure failed saving onRetry={retry} />);
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
});
