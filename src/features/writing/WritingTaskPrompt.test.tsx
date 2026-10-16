import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WritingTaskPrompt } from './WritingDeskPage';

afterEach(cleanup);

test('a chart failure keeps the prompt readable and provides a working retry', async () => {
  render(<WritingTaskPrompt prompt="Describe the chart." image="/chart.svg" />);
  fireEvent.error(screen.getByRole('img', { name: 'Task chart' }));
  expect(screen.getByRole('status')).toHaveTextContent('The task chart could not load.');
  expect(screen.getByText('Describe the chart.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Zoom task chart' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry chart' }));
  expect(screen.getByRole('img', { name: 'Task chart' })).toHaveAttribute('src', '/chart.svg');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Zoom task chart' }));
  expect(screen.getByRole('dialog', { name: 'Task chart' })).toBeInTheDocument();
});

test('a new question can display its chart after the previous chart failed', () => {
  const view = render(<WritingTaskPrompt prompt="First chart" image="/first.svg" />);
  fireEvent.error(screen.getByRole('img', { name: 'Task chart' }));
  view.rerender(<WritingTaskPrompt prompt="Second chart" image="/second.svg" />);
  expect(screen.getByRole('img', { name: 'Task chart' })).toHaveAttribute('src', '/second.svg');
});
