import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyBackLink, VocabularyLink } from './VocabularyRouteLink';

vi.mock('../../storage/remote', () => ({ accountId: () => 'one' }));

function Page() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="Location">{location.pathname + location.search}</output>
    <VocabularyBackLink />
    <VocabularyLink to="/vocabulary/entry/pear">Pear details</VocabularyLink>
    <button onClick={() => navigate(location.pathname + '?card=next', {replace: true, state: location.state})}>Next card</button>
  </>;
}

beforeEach(() => { window.history.replaceState({ idx: 4 }, ''); sessionStorage.clear(); });
afterEach(() => cleanup());

const restored = {
  pathname: '/vocabulary/entry/apple',
  state: {
    workspaceModuleRestore: { owner: 'one', url: '/vocabulary/entry/apple' },
    vocabularyRestore: true,
    vocabularyReturn: { owner: 'one', url: '/vocabulary/words?tag=fruit', parent: { owner: 'one', url: '/vocabulary/wordbooks?category=fruit' } },
  },
};

test('Back on a resumed vocabulary detail walks the parent URLs instead of popping to writing', async () => {
  render(<MemoryRouter initialEntries={['/write', restored]} initialIndex={1}><Page /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Back to my words' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit');
  await user.click(screen.getByRole('link', { name: 'All wordbooks' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/wordbooks?category=fruit');
});

test('changing a resumed page query keeps Back within the vocabulary parent chain', async () => {
  render(<MemoryRouter initialEntries={['/write', restored]} initialIndex={1}><Page /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Next card' }));
  await user.click(screen.getByRole('link', { name: 'Back to my words' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit');
});

test('a fresh detail opened from a resumed module returns to its actual source entry', async () => {
  render(<MemoryRouter initialEntries={['/write', restored]} initialIndex={1}><Page /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Pear details' }));
  window.history.replaceState({ idx: 5 }, '');
  await user.click(screen.getByRole('link', { name: 'Back to word details' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/entry/apple');
  await user.click(screen.getByRole('link', { name: 'Back to my words' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/vocabulary/words?tag=fruit');
});
