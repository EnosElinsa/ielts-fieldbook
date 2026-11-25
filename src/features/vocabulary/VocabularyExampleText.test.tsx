import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { VocabularyExampleText } from './VocabularyExampleText';
afterEach(cleanup);

const marks = (text: string, term: string, pos?: string, form?: string) => {
  const { container } = render(<p><VocabularyExampleText text={text} term={term} pos={pos} form={form} /></p>);
  expect(container.textContent).toBe(text);
  return [...container.querySelectorAll('mark')].map(node => node.textContent);
};

test.each([
  ['They carry it and she carries it; he carried it, carrying on.', 'carry', 'verb', ['carry', 'carries', 'carried', 'carrying']],
  ['He stopped, stops and is stopping.', 'stop', 'verb', ['stopped', 'stops', 'stopping']],
  ['She used it; the use and using of it.', 'use', 'verb', ['used', 'use', 'using']],
  ['They tied it and keep tying it.', 'tie', 'verb', ['tied', 'tying']],
  ['The heroes honoured one hero.', 'hero', 'noun', ['heroes', 'hero']],
  ['Two potatoes and a potato.', 'potato', 'noun', ['potatoes', 'potato']],
  ['Studies show she studied and is studying.', 'study', 'verb', ['Studies', 'studied', 'studying']],
  ['A fox, two foxes and a box.', 'fox', 'noun', ['fox', 'foxes']],
])('highlights regular inflections in %s', (text, term, pos, expected) => {
  expect(marks(text, term, pos)).toEqual(expected);
});

test('highlighting does not over-match longer words, other classes or pattern characters', () => {
  expect(marks('A bat fought a battle; batsmen batter.', 'bat', 'noun')).toEqual(['bat']);
  expect(marks('The planet moved; he plans it.', 'plan', 'verb')).toEqual(['plans']);
  expect(marks('Quickly and quicker.', 'quick', 'adj')).toEqual([]);
  expect(marks('A cats and dogs day.', 'cat', 'verb', undefined)).toEqual(['cats']);
  expect(marks('Use (a|b) not ab.', '(a|b)', 'verb')).toEqual(['(a|b)']);
  expect(marks('Café cafés cafeteria.', 'café', 'noun')).toEqual(['Café']);
});

test('reviewed irregular forms still highlight alongside regular ones, and a missing class falls back to every regular form', () => {
  expect(marks('He ran and runs; she is running.', 'run', 'verb', 'ran')).toEqual(['ran', 'runs', 'running']);
  expect(marks('He asks and asked.', 'ask')).toEqual(['asks', 'asked']);
  expect(marks('Nothing to find here.', 'plan', 'verb')).toEqual([]);
});
