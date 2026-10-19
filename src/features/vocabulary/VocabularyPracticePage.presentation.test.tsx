import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyPracticePage } from './VocabularyPracticePage';

const state = vi.hoisted(() => ({ controller: {} as any }));
vi.mock('./useVocabularyPracticeController', () => ({ useVocabularyPracticeController: () => state.controller }));
vi.mock('./VocabularyPages', () => ({ VocabularyNavigation: () => <nav /> }));
vi.mock('./VocabularyPracticeSetup', () => ({ VocabularyPracticeSetup: () => <p>Free practice setup</p> }));
vi.mock('../../storage/remote', () => ({ accountId: () => 'isolated-presentation' }));
afterEach(cleanup);

test.each(['', 'This saved session is unavailable for this account.'])('history preparation never flashes free setup or stale-plan errors (%s)', error => {
  state.controller = { session: null, results: null, study: false, catalogReady: true, planFailure: 'stale-target', error };
  render(<MemoryRouter initialEntries={['/vocabulary/history/submitted?planId=finished']}><VocabularyPracticePage /></MemoryRouter>);
  expect(screen.queryByText('Free practice setup')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Vocabulary review' })).not.toBeInTheDocument();
  if (error) expect(screen.getByRole('alert')).toHaveTextContent(error);
  else expect(screen.getByRole('status')).toHaveTextContent('Loading session results…');
});
