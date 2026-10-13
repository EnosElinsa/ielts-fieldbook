import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CardSkeleton, InlineLoadingState, PageLoadingState, StateMessage } from './AsyncState';

afterEach(() => { cleanup(); vi.useRealTimers(); });

test('a page announces one status while placeholders remain decorative', () => {
  const { container } = render(<PageLoadingState variant="workbench" message="Loading source material…" />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Loading source material…');
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  expect(container.querySelector('.async-skeleton-layout')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('a slow request offers its real retry after ten seconds and resets the delay on retry', () => {
  vi.useFakeTimers();
  const onRetry = vi.fn();
  render(<PageLoadingState message="Loading group words…" onRetry={onRetry} retryLabel="Retry group" />);
  act(() => vi.advanceTimersByTime(9_999));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toHaveTextContent('Taking longer than usual.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry group' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByRole('button', { name: 'Retry group' })).toBeInTheDocument();
});

test('slow inline requests never invent a retry and clear the timeout when unmounted', () => {
  vi.useFakeTimers();
  const { unmount } = render(<InlineLoadingState message="Loading audio…" />);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('an error announces the useful message and keeps retry keyboard accessible', () => {
  const onRetry = vi.fn();
  const { rerender } = render(<StateMessage kind="error" title="Source unavailable" message="Check the connection and retry." onRetry={onRetry} retryLabel="Retry audio" retryDisabled />);
  expect(screen.getByRole('alert')).toHaveTextContent('Check the connection and retry.');
  expect(screen.getByRole('button', { name: 'Retry audio' })).toBeDisabled();
  rerender(<StateMessage kind="error" message="Check the connection and retry." onRetry={onRetry} retryLabel="Retry audio" />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry audio' }));
  expect(onRetry).toHaveBeenCalledOnce();
  rerender(<StateMessage title="No saved attempts yet." message="Complete a practice part." />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('standalone card placeholders expose no loading or interactive controls', () => {
  const { container } = render(<CardSkeleton />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
