import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import diagrams from '../../domain/vocabulary/senseDiagrams.json';
import type { ResolvedVocabularyLearningContext } from '../../domain/vocabulary/context';
import { VocabularyLearningVisual } from './VocabularyLearningVisual';
afterEach(cleanup);

for (const row of diagrams) test(`${row.term}/${row.senseId} draws only its exact meaning`, async () => {
  const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
  const resolved = { entry: { id: row.entryId, term: row.term, senses: [sense] }, sense, contentReviewed: false } as ResolvedVocabularyLearningContext;
  const view = render(<VocabularyLearningVisual resolved={resolved} />);
  const supplementary = screen.queryByText('View diagram');
  if (supplementary) fireEvent.click(supplementary);
  expect(await screen.findByRole('img')).toHaveAccessibleName(new RegExp(`^${row.term}:`));
  const diagramName = screen.getByRole('img').getAttribute('aria-label')!;
  expect(screen.getByText(/Illustrative diagram/)).toBeInTheDocument();
  for (const patch of [{ id: 'other-sense' }, { definition: 'My different classroom meaning.' }, { pos: 'other' }, { source: 'Personal note' }]) {
    view.rerender(<VocabularyLearningVisual resolved={{ ...resolved, sense: { ...sense, ...patch } }} />);
    expect(screen.queryByRole('img', { name: diagramName })).not.toBeInTheDocument();
  }
  view.rerender(<VocabularyLearningVisual resolved={{ ...resolved, entry: { ...resolved.entry, id: 'another-entry' } }} />);
  expect(screen.queryByRole('img', { name: diagramName })).not.toBeInTheDocument();
});
