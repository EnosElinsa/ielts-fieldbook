import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import diagrams from '../../domain/vocabulary/senseDiagrams.json';
import type { ResolvedVocabularyLearningContext } from '../../domain/vocabulary/context';
import { VocabularyLearningVisual } from './VocabularyLearningVisual';
import { VocabularySenseContent } from './VocabularySenseContent';

afterEach(cleanup);

function meaning(kind: string): ResolvedVocabularyLearningContext {
  const row = diagrams.find(diagram => diagram.kind === kind)!;
  const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
  return { entry: { id: row.entryId, term: row.term, senses: [sense] }, sense,
    status: 'unreviewed', reviewed: false, contentReviewed: false, contentVersion: 'test' } as ResolvedVocabularyLearningContext;
}

test('an abstract diagram is supplementary, loads only after expansion and unmounts when closed', async () => {
  const user = userEvent.setup();
  const view = render(<VocabularyLearningVisual resolved={meaning('acquire-possession')} />);
  expect(view.container.querySelector('svg')).toBeNull();
  expect(screen.queryByText('Loading diagram…')).not.toBeInTheDocument();
  await user.click(screen.getByText('View diagram'));
  expect(await screen.findByRole('img', { name: /^acquire:/ })).toBeVisible();
  await user.click(screen.getByText('View diagram'));
  await waitFor(() => expect(view.container.querySelector('svg')).toBeNull());
});

test('a different selected meaning resets a previously opened supplementary diagram', async () => {
  const user = userEvent.setup();
  const view = render(<VocabularyLearningVisual resolved={meaning('acquire-possession')} />);
  await user.click(screen.getByText('View diagram'));
  await screen.findByRole('img');
  view.rerender(<VocabularyLearningVisual resolved={meaning('earn-income')} />);
  expect(view.container.querySelector('details')).not.toHaveAttribute('open');
  expect(view.container.querySelector('svg')).toBeNull();
});

test.each(['gain-catchup', 'numerical-rise'])('the reviewed quantitative relation %s stays inline regardless of box counts', async kind => {
  render(<VocabularyLearningVisual resolved={meaning(kind)} />);
  expect(await screen.findByRole('img')).toBeVisible();
  expect(screen.queryByText('View diagram')).not.toBeInTheDocument();
});

test('an edited meaning cannot inherit its former public diagram or supplementary control', () => {
  const resolved = meaning('acquire-possession');
  resolved.sense = { ...resolved.sense!, definition: 'My own meaning.' };
  const view = render(<VocabularyLearningVisual resolved={resolved} />);
  expect(view.container).toBeEmptyDOMElement();
});

test('a learning card keeps its example and collocations visible while grouping secondary notes', async () => {
  const user = userEvent.setup();
  render(<VocabularySenseContent sense={{ id: 'bank', definition: 'Land beside a river.', pos: 'noun',
    example: 'We sat on the bank.', usage: 'The sides of a river.', collocations: ['river bank'],
    distinctions: ['A shore borders a sea or lake.'] }} showLearningNotes />);
  expect(screen.getByText('We sat on the bank.')).toBeVisible();
  expect(screen.getByText('river bank')).toBeVisible();
  expect(screen.getByText('Compare meanings')).not.toBeVisible();
  await user.click(screen.getByText('Usage and meaning notes'));
  expect(screen.getByRole('heading', { name: 'Compare meanings' })).toBeVisible();
  expect(screen.getByText('The sides of a river.')).toBeVisible();
});

test('a fallback example must belong to the same meaning, definition and part of speech', () => {
  const sense = { id: 'bank', definition: 'Land beside a river.', pos: 'noun', example: '' };
  const view = render(<VocabularySenseContent sense={sense} learningExample={{
    sense: { ...sense, id: 'other', definition: 'A financial institution.' }, example: 'I went to the bank to deposit cash.',
  }} showMissingExample />);
  expect(screen.queryByText(/deposit cash/)).not.toBeInTheDocument();
  expect(screen.getByText('A learning example has not been added for this meaning yet.')).toBeInTheDocument();
  view.rerender(<VocabularySenseContent sense={sense} learningExample={{ sense, example: 'We sat on the bank.' }} />);
  expect(screen.getByText('We sat on the bank.')).toBeVisible();
});

test('repeated public notes appear once and a meaning without secondary notes has no empty disclosure', () => {
  const view = render(<VocabularySenseContent sense={{ id: 'x', definition: 'A meaning.', pos: 'noun', example: '',
    usage: 'Only in this construction.', distinctions: ['Only in this construction.'] }} showLearningNotes />);
  expect(screen.getAllByText('Only in this construction.')).toHaveLength(1);
  view.rerender(<VocabularySenseContent sense={{ id: 'x', definition: 'A meaning.', pos: 'noun', example: 'An example.' }} showLearningNotes />);
  expect(screen.queryByText('Usage and meaning notes')).not.toBeInTheDocument();
});
