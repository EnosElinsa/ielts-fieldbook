import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PageErrorBoundary } from './PageErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('a failed page can retry without replacing the surrounding workspace', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  function Page() { if (fail) throw new Error('Broken page'); return <p>Recovered page</p>; }
  render(<MemoryRouter><p>Workspace navigation</p><PageErrorBoundary resetKey="one"><Page /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('This page could not open');
  expect(screen.getByText('Workspace navigation')).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Recovered page')).toBeInTheDocument();
});

test('navigation resets page failures and failed imports offer a page reload', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedImport(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/page.js'); }
  const view = render(<MemoryRouter><PageErrorBoundary resetKey="one"><FailedImport /></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  view.rerender(<MemoryRouter><PageErrorBoundary resetKey="two"><p>Other page</p></PageErrorBoundary></MemoryRouter>);
  expect(screen.getByText('Other page')).toBeInTheDocument();
});
