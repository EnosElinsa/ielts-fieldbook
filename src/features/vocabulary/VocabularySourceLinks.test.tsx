import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VocabularySourceLinks, VocabularyWordbookSources } from './VocabularySourceLinks';
import type { VocabularySource } from '../../domain/vocabulary';
const sources: VocabularySource[] = [
  { type: 'reading', id: 'one', senseId: 'river', exam: { sectionId: 'one', paragraphId: 'A', blockId: 'passage:p:A', quote: 'bank', start: 3, end: 7 } },
  { type: 'reading', id: 'two', senseId: 'river', exam: { sectionId: 'two', paragraphId: 'B', quote: 'bank' } },
  { type: 'listening', id: 'three', senseId: 'money', exam: { sectionId: 'three', sentenceId: 'sentence-1', quote: 'bank' } },
];
afterEach(cleanup);
test('mixed results identify unique wordbook groups and retain the chosen session source', () => {
  const groups: VocabularySource[] = [
    { type: 'wordbook', id: 'a', bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' },
    { type: 'wordbook', id: 'duplicate', bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-01-group-01' },
    { type: 'wordbook', id: 'b', bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-02-group-01' },
  ];
  const view = render(<MemoryRouter><VocabularyWordbookSources sources={groups} /></MemoryRouter>);
  expect(screen.getAllByRole('link')).toHaveLength(2);
  view.rerender(<MemoryRouter><VocabularyWordbookSources sources={groups} context={groups[2]} /></MemoryRouter>);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('chapter-02-group-01/words'));
});
test('source links preserve exact requested Part, meaning and text anchors', () => {
  render(<MemoryRouter><VocabularySourceLinks sources={sources} senseId='river' filter={{ sourceType: 'reading', sourceId: 'one' }} /></MemoryRouter>);
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(1);
  const url = new URL(links[0].getAttribute('href')!, 'https://example.test');
  expect(url.pathname).toBe('/reading/source/one');
  expect(url.searchParams.get('paragraph')).toBe('A');
  expect(url.searchParams.get('block')).toBe('passage:p:A');
  expect(url.searchParams.get('start')).toBe('3');
});
test('listening source links retain intensive sentence playback', () => {
  render(<MemoryRouter><VocabularySourceLinks sources={sources} senseId='money' /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Original source' })).toHaveAttribute('href', expect.stringContaining('/listening/source/three?sentence=sentence-1'));
  expect(screen.getByRole('link', { name: 'Play source sentence' })).toHaveAttribute('href', '/listening/intensive/three?sentence=sentence-1');
});
