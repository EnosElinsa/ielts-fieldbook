import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularyLearningVisual } from './VocabularyLearningVisual';
import { resolveVocabularyLearningContext, type ResolvedVocabularyLearningContext } from '../../domain/vocabulary/context';
import type { VocabularyEntry } from '../../domain/vocabulary/types';
import supplements from '../../domain/vocabulary/contextSenseOverlay.json';

afterEach(cleanup);
function meaning(term: string, definition: string, pos = 'noun', example = ''): ResolvedVocabularyLearningContext {
  const sense = { id: 'selected', definition, pos, example };
  const entry = { id: 'personal', term, senses: [sense] } as VocabularyEntry;
  return { entry, sense, status: 'unreviewed', reviewed: false, contentReviewed: false, context: undefined, contentVersion: 'test' };
}
const core = { id: 've-7c70dbbe', term: 'core', senses: [supplements.bindings.find(item => item.entryId === 've-7c70dbbe' && item.unitId === 'ielts-vocabulary-chapter-01-group-01')!.originalSense] } as unknown as VocabularyEntry;

test('a concrete pea noun draws a pod but a changed selected meaning has no misleading picture', () => {
  const view = render(<VocabularyLearningVisual resolved={meaning('pea', 'A small round green seed eaten as a vegetable.')} />);
  expect(screen.getByRole('img', { name: 'pea: Green peas in an open pod' })).toBeInTheDocument();
  view.rerender(<VocabularyLearningVisual resolved={meaning('pea', 'A learner nickname for a person.')} />);
  expect(screen.queryByRole('img', { name: /Green peas/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test.each([
  ['carrot', 'An incentive offered to encourage a person.'],
  ['apple', 'A software company that makes computers.'],
  ['orange', 'A colour between red and yellow.'],
  ['fruit', 'The result or outcome of an action.'],
])('ambiguous %s uses the selected meaning rather than a food picture', (term, definition) => {
  render(<VocabularyLearningVisual resolved={meaning(term, definition)} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText(`Illustration · ${term}`)).not.toBeInTheDocument();
});

test('abstract meanings do not repeat definitions as decorative diagrams', () => {
  render(<VocabularyLearningVisual resolved={meaning('mitigate', 'To reduce the severity of an adverse effect.', 'verb', 'Trees mitigate summer heat.')} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('sense-specific photos preserve credits, show a failure and retry the actual image', () => {
  const earth = resolveVocabularyLearningContext(core, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  const food = resolveVocabularyLearningContext(core, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-12-group-02' });
  const view = render(<VocabularyLearningVisual resolved={earth} />);
  const image = screen.getByRole('img', { name: /Cutaway of Earth/ });
  expect(image).toHaveAttribute('width', '640');
  fireEvent.click(screen.getByText('Image credits'));
  expect(screen.getByText('Surachit · CC BY-SA 3.0')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'License' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0');
  fireEvent.error(image);
  expect(screen.queryByRole('img', { name: /Cutaway of Earth/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(/Image could not load/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry image' }));
  expect(screen.getByRole('img', { name: /Cutaway of Earth/ })).toHaveAttribute('src', '/vocabulary-media/images/earth-layers.webp');
  fireEvent.error(screen.getByRole('img', { name: /Cutaway of Earth/ }));
  view.rerender(<VocabularyLearningVisual resolved={food} />);
  expect(screen.getByRole('img', { name: /Apple cross-sections/ })).toHaveAttribute('src', '/vocabulary-media/images/apple-section.webp');
});

test('a learner edit with the same public sense id never inherits the reviewed photo', () => {
  const edited = resolveVocabularyLearningContext({ ...core, senses: [{ ...core.senses[0], definition: 'The central idea of my presentation.' }] }, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' });
  render(<VocabularyLearningVisual resolved={edited} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Cutaway of Earth/ })).not.toBeInTheDocument();
});

test('an unsupported meaning has no decorative dictionary or relation fragments', () => {
  const { container } = render(<VocabularyLearningVisual resolved={meaning('animal', 'A [[living|living organism]] that feeds on {{lb|en|organic}} material.', 'noun', 'Meronym: [[stock animal]]')} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText(/Meronym|stock animal/)).not.toBeInTheDocument();
  expect(container.querySelector('.visual-map-example-text')).toBeNull();
});

test('paste illustration represents the mixture but never the computer verb', () => {
  const view=render(<VocabularyLearningVisual resolved={meaning('paste','A thick, soft mixture of a solid material and liquid.')} />);
  expect(screen.getByRole('img',{name:'paste: A bowl of thick mixture with a spoon'})).toBeInTheDocument();
  view.rerender(<VocabularyLearningVisual resolved={meaning('paste','To insert copied text.','verb')} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
