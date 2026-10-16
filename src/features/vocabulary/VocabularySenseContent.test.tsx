import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularySenseContent } from './VocabularySenseContent';
afterEach(cleanup);

test('dictionary learning notes show collocations and sense distinctions next to their example', () => {
  render(<VocabularySenseContent sense={{ id: 'bank-river', definition: 'Land beside a river.', pos: 'noun', example: 'We sat on the bank of the river.', collocations: ['river bank'], distinctions: ['A shore borders a sea or lake.'] }} showLearningNotes />);
  expect(screen.getByRole('heading', { name: 'Collocations' })).toBeInTheDocument();
  expect(screen.getByText('river bank')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Compare meanings' })).toBeInTheDocument();
  expect(screen.getByText('A shore borders a sea or lake.')).toBeInTheDocument();
});
