import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Toast, TOAST_FADE_MS, TOAST_VISIBLE_MS } from './Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('Toast stays visible for >=5000ms, pauses on hover and focus, and dismisses cleanly', async () => {
  vi.useFakeTimers();
  const view = render(<Toast message="Saved your review." visible revision={1} />);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Saved your review.');
  const toastEl = status.closest('#toast')!;
  expect(toastEl).toHaveClass('show');

  // Auto-hide waits the full duration (5000ms).
  act(() => { vi.advanceTimersByTime(TOAST_VISIBLE_MS - 100); });
  expect(toastEl).toHaveClass('show');

  // Hover pauses auto-hide past the remaining time.
  fireEvent.mouseEnter(toastEl);
  act(() => { vi.advanceTimersByTime(6000); });
  expect(toastEl).toHaveClass('show');

  // Leaving grants release grace (>=1200ms) before dismissing.
  fireEvent.mouseLeave(toastEl);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(toastEl).toHaveClass('show');
  act(() => { vi.advanceTimersByTime(300 + TOAST_FADE_MS); });
  expect(toastEl).not.toHaveClass('show');

  // Revision bump re-announces the same message, and focus holds it open.
  view.rerender(<Toast message="Saved your review." visible revision={2} />);
  expect(toastEl).toHaveClass('show');
  const dismissBtn = screen.getByRole('button', { name: 'Dismiss notification' });
  fireEvent.focus(dismissBtn);
  act(() => { vi.advanceTimersByTime(6000); });
  expect(toastEl).toHaveClass('show');

  // Clicking dismiss hides it immediately.
  vi.useRealTimers();
  await userEvent.setup().click(dismissBtn);
  expect(toastEl).not.toHaveClass('show');
});
