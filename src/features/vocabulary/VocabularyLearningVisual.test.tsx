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
const core = { id: 've-7c70dbbe', term: 'core', senses: [supplements.bindings.find(item => item.entryId === 've-7c70dbbe' && item.unitId === '21795')!.originalSense] } as unknown as VocabularyEntry;

test('a concrete pea noun draws a pod but a changed selected meaning gets its actual context', () => {
  const view = render(<VocabularyLearningVisual resolved={meaning('pea', 'A small round green seed eaten as a vegetable.')} />);
  expect(screen.getByRole('img', { name: 'pea: Green peas in an open pod' })).toBeInTheDocument();
  view.rerender(<VocabularyLearningVisual resolved={meaning('pea', 'A learner nickname for a person.')} />);
  expect(screen.queryByRole('img', { name: /Green peas/ })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Context map for pea/ })).toHaveTextContent('A learner nickname for a person.');
  expect(screen.getByText('Context map · selected meaning')).toBeInTheDocument();
});

test.each([
  ['carrot', 'An incentive offered to encourage a person.'],
  ['apple', 'A software company that makes computers.'],
  ['orange', 'A colour between red and yellow.'],
  ['fruit', 'The result or outcome of an action.'],
])('ambiguous %s uses the selected meaning rather than a food picture', (term, definition) => {
  render(<VocabularyLearningVisual resolved={meaning(term, definition)} />);
  expect(screen.getByRole('img', { name: `Context map for ${term}: ${definition}` })).toHaveTextContent(definition);
  expect(screen.queryByText(`Illustration · ${term}`)).not.toBeInTheDocument();
});

test('verb and abstract maps keep the whole selected definition and example readable', () => {
  const definition = 'To reduce the severity of an adverse effect while leaving its underlying cause visible, allowing people to respond with a more carefully chosen action.';
  const example = 'Trees mitigate the effects of summer heat in the city, especially when they shade the paths used by pedestrians.';
  const { container } = render(<VocabularyLearningVisual resolved={meaning('mitigate', definition, 'verb', example)} />);
  const illustration = screen.getByRole('img');
  expect(illustration).toHaveAccessibleName(`Context map for mitigate: ${definition}`);
  const lines = Array.from(container.querySelectorAll('.visual-map-body tspan')).map(line => line.textContent?.trim());
  expect(lines.join(' ')).toBe(definition);
  expect(lines.every(line => line!.length <= 42)).toBe(true);
  expect(Array.from(container.querySelectorAll('.visual-map-example-text tspan')).map(line => line.textContent?.trim()).join(' ')).toBe(example);
});

test('sense-specific photos preserve credits, fail to a context map and retry the actual image', () => {
  const earth = resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21795' });
  const food = resolveVocabularyLearningContext(core, { bookId: 'guixue:10174', unitId: '21840' });
  const view = render(<VocabularyLearningVisual resolved={earth} />);
  const image = screen.getByRole('img', { name: /Cutaway of Earth/ });
  expect(image).toHaveAttribute('width', '640');
  fireEvent.click(screen.getByText('Image credits'));
  expect(screen.getByText('Surachit · CC BY-SA 3.0')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'License' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0');
  fireEvent.error(image);
  expect(screen.queryByRole('img', { name: /Cutaway of Earth/ })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Context map for core/ })).toHaveTextContent(earth.sense!.definition.replace(/\s+/g, ' ').trim());
  fireEvent.click(screen.getByRole('button', { name: 'Retry image' }));
  expect(screen.getByRole('img', { name: /Cutaway of Earth/ })).toHaveAttribute('src', '/vocabulary-media/images/earth-layers.webp');
  fireEvent.error(screen.getByRole('img', { name: /Cutaway of Earth/ }));
  view.rerender(<VocabularyLearningVisual resolved={food} />);
  expect(screen.getByRole('img', { name: /Apple cross-sections/ })).toHaveAttribute('src', '/vocabulary-media/images/apple-section.webp');
});

test('a learner edit with the same public sense id never inherits the reviewed photo', () => {
  const edited = resolveVocabularyLearningContext({ ...core, senses: [{ ...core.senses[0], definition: 'The central idea of my presentation.' }] }, { bookId: 'guixue:10174', unitId: '21795' });
  render(<VocabularyLearningVisual resolved={edited} />);
  expect(screen.getByRole('img', { name: /Context map for core/ })).toHaveTextContent('The central idea of my presentation.');
  expect(screen.queryByRole('img', { name: /Cutaway of Earth/ })).not.toBeInTheDocument();
});

test('a context map cleans dictionary markup and never presents relation fragments as examples', () => {
  const { container } = render(<VocabularyLearningVisual resolved={meaning('animal', 'A [[living|living organism]] that feeds on {{lb|en|organic}} material.', 'noun', 'Meronym: [[stock animal]]')} />);
  expect(screen.getByRole('img')).toHaveAccessibleName('Context map for animal: A living organism that feeds on organic material.');
  expect(screen.queryByText(/Meronym|stock animal/)).not.toBeInTheDocument();
  expect(container.querySelector('.visual-map-example-text')).toBeNull();
});
