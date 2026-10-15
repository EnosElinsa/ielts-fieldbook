import { expect, test } from 'vitest';
import { snapTextSelection, vocabularySelectionText } from './textSelection';

test.each([
  ['The garden opened.', 6, 8, 'garden'],
  ['The garden opened.', 4, 10, 'garden'],
  ['The garden opened.', 8, 14, 'garden opened'],
  ['“Don’t” re-use the island’s resources.', 3, 5, 'Don’t'],
  ['“Don’t” re-use the island’s resources.', 10, 11, 're-use'],
  ['“Don’t” re-use the island’s resources.', 21, 23, 'island’s'],
  ['A café and nai\u0308ve visitors.', 3, 5, 'café'],
  ['A café and nai\u0308ve visitors.', 12, 14, 'nai\u0308ve'],
  ['A 3.5-million-year-old fossil.', 5, 8, '3.5-million-year-old'],
  ['The garden opened.', 4, 18, 'garden opened.'],
  [' The garden  ', 0, 13, 'The garden'],
])('snaps %s [%s, %s] to complete words without changing source offsets', (text, start, end, quote) => {
  const range = snapTextSelection(text, start, end)!;
  expect(text.slice(range.start, range.end)).toBe(quote);
});

test.each(['… ! ', ' ', '—', '“”'])('punctuation-only selection %s cannot become a vocabulary entry', text => {
  expect(snapTextSelection(text, 0, text.length)).toBeNull();
  expect(vocabularySelectionText(text)).toBe('');
});

test('selecting just punctuation between words never pulls in an adjacent word', () => {
  expect(snapTextSelection('word, next', 4, 5)).toBeNull();
  expect(snapTextSelection('word next', 4, 5)).toBeNull();
  expect(snapTextSelection('word', 2, 2)).toBeNull();
});

test('vocabulary strips only outer punctuation and retains contractions and phrase structure', () => {
  expect(vocabularySelectionText(' “don’t re-use,” ')).toBe('don’t re-use');
  expect(vocabularySelectionText('garden opened. Then it')).toBe('garden opened. Then it');
});
