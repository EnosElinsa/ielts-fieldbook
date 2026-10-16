import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularySenseContent } from './VocabularySenseContent';
import corrections from '../../domain/vocabulary/readinessCorrections.json';
import { supplementVocabularySense } from '../../domain/vocabulary/readiness';
import type { VocabularySense } from '../../domain/vocabulary/types';
afterEach(cleanup);

test('an exact-bound historical reading explanation is labelled and does not turn a learner’s replacement sentence into a reading note', () => {
  const row = corrections.find(row => row.entryId === 've-649a8d90' && row.senseId === 'kaikki:a0e69a49931b08846d')!;
  const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], () => false);
  const view = render(<VocabularySenseContent entryId={row.entryId} sense={sense} showLearningNotes />);
  expect(screen.getByText('Reading note')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Reading cues' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Collocations' })).not.toBeInTheDocument();
  expect(screen.getByText(sense.example)).toBeInTheDocument();
  view.rerender(<VocabularySenseContent entryId={row.entryId} sense={{ ...sense, example: 'My own learning sentence.' }} showLearningNotes />);
  expect(screen.queryByText('Reading note')).not.toBeInTheDocument();
  expect(screen.getByText('My own learning sentence.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Collocations' })).toBeInTheDocument();
});

test('dictionary learning notes show collocations and sense distinctions next to their example', () => {
  render(<VocabularySenseContent sense={{ id: 'bank-river', definition: 'Land beside a river.', pos: 'noun', example: 'We sat on the bank of the river.', collocations: ['river bank'], distinctions: ['A shore borders a sea or lake.'] }} showLearningNotes />);
  expect(screen.getByRole('heading', { name: 'Collocations' })).toBeInTheDocument();
  expect(screen.getByText('river bank')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Compare meanings' })).toBeInTheDocument();
  expect(screen.getByText('A shore borders a sea or lake.')).toBeInTheDocument();
});

test('a separate public reading explanation keeps its type when the learner has cleared the example', () => {
  const row = corrections.find(row => row.entryId === 've-649a8d90' && row.senseId === 'kaikki:a0e69a49931b08846d')!;
  const publicSense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], () => false);
  const personal = { ...publicSense, example: '' };
  const view = render(<VocabularySenseContent entryId={row.entryId} sense={personal} learningExample={{ example: publicSense.example, sense: publicSense }} />);
  expect(screen.getByText('Reading note')).toBeInTheDocument();
  expect(screen.queryByText('Learning example')).not.toBeInTheDocument();
  expect(personal.example).toBe('');
  view.rerender(<VocabularySenseContent entryId={row.entryId} sense={{ ...personal, example: 'A sentence from my class.' }} learningExample={{ example: publicSense.example, sense: publicSense }} />);
  expect(screen.queryByText('Reading note')).not.toBeInTheDocument();
  expect(screen.getByText('A sentence from my class.')).toBeInTheDocument();
  expect(screen.queryByText(publicSense.example)).not.toBeInTheDocument();
});
