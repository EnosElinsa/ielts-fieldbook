import { expect, test } from 'vitest';
import { findSourceBlock } from './sourceLocation';

function documentWith(html: string) { const container = document.createElement('div'); container.innerHTML = html; return container; }

test('quote lookup chooses the passage when the same words occur in a question', () => {
  const container = documentWith('<span data-source-block="question:q">The garden opened in 1990.</span><span data-source-block="passage:p:A">The garden opened in 1990.</span>');
  expect(findSourceBlock(container, { quote: 'The garden opened in 1990.' })?.dataset.sourceBlock).toBe('passage:p:A');
});

test('quote lookup tolerates typography and a later sentence changed by the source', () => {
  const container = documentWith('<span data-source-block="passage:p:A">The garden’s gate opened in 1990. Agriculture was practised here.</span>');
  expect(findSourceBlock(container, { quote: "The garden's gate opened in 1990. Agriculture was practiced here." })?.dataset.sourceBlock).toBe('passage:p:A');
});

test('an ambiguous or absent quote does not focus an arbitrary paragraph', () => {
  const container = documentWith('<span data-source-block="passage:p:A">The garden opened in 1990.</span><span data-source-block="passage:p:B">The garden opened in 1990.</span>');
  expect(findSourceBlock(container, { quote: 'The garden opened in 1990.' })).toBeUndefined();
  expect(findSourceBlock(container, { quote: 'An unavailable source quote.' })).toBeUndefined();
});
