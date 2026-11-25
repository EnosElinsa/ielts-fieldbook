import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WritingTaskPrompt } from './WritingDeskPage';

afterEach(() => { cleanup(); vi.useRealTimers(); });

test('a chart failure keeps the prompt readable and provides a working retry', async () => {
  render(<WritingTaskPrompt prompt="Describe the chart." image="/chart.svg" />);
  fireEvent.error(screen.getByRole('img', { name: 'Task chart' }));
  expect(screen.getByRole('status')).toHaveTextContent('The task chart could not load.');
  expect(screen.getByText('Describe the chart.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Zoom task chart' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry chart' }));
  expect(screen.getByRole('img', { name: 'Task chart' })).toHaveAttribute('src', '/chart.svg?retry=1');
  expect(screen.getByRole('button', { name: 'Zoom task chart' })).toBeDisabled();
  fireEvent.load(screen.getByRole('img', { name: 'Task chart' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Zoom task chart' }));
  expect(screen.getByRole('dialog', { name: 'Task chart' })).toBeInTheDocument();
});

test('a stalled task chart transitions to an error retry state after 15 seconds', () => {
  vi.useFakeTimers();
  render(<WritingTaskPrompt prompt="Describe the chart." image="/stalled.svg" />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading chart…');
  act(() => { vi.advanceTimersByTime(15_000); });
  expect(screen.getByRole('status')).toHaveTextContent('The task chart could not load.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
  expect(screen.getByRole('img', { name: 'Task chart' })).toHaveAttribute('src', '/stalled.svg?retry=1');
});

test('a new question can display its chart after the previous chart failed', () => {
  const view = render(<WritingTaskPrompt prompt="First chart" image="/first.svg" />);
  fireEvent.error(screen.getByRole('img', { name: 'Task chart' }));
  view.rerender(<WritingTaskPrompt prompt="Second chart" image="/second.svg" />);
  expect(screen.getByRole('img', { name: 'Task chart' })).toHaveAttribute('src', '/second.svg');
  expect(screen.getByRole('status')).toHaveTextContent('Loading chart…');
});

test('a delayed chart reserves a visible loading state and enables zoom only after loading', () => {
  const view=render(<WritingTaskPrompt prompt="Describe the map." image="/map.svg" />);
  const original=screen.getByRole('img', {name:'Task chart'});
  expect(screen.getByRole('status')).toHaveTextContent('Loading chart…');
  expect(screen.getByRole('button', {name:'Zoom task chart'})).toBeDisabled();
  fireEvent.load(original);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Zoom task chart'})).toBeEnabled();
  view.rerender(<WritingTaskPrompt prompt="Describe the new map." image="/other.svg" />);
  fireEvent.error(original);
  expect(screen.getByRole('status')).toHaveTextContent('Loading chart…');
  expect(screen.getByRole('img', {name:'Task chart'})).toHaveAttribute('src','/other.svg');
});
