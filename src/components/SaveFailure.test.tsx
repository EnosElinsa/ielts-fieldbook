import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { SaveFailure } from './SaveFailure';

afterEach(cleanup);

test('the failed save line stays only while the flag is set', () => {
  const { rerender } = render(<SaveFailure failed />);
  expect(screen.getByRole('status')).toHaveTextContent('Could not save to your account. Try again.');
  rerender(<SaveFailure failed={false} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  const shell = readFileSync('src/components/Shell.tsx', 'utf8');
  expect(shell).toContain('<SaveFailure failed={fb.saveFailed} />');
});
