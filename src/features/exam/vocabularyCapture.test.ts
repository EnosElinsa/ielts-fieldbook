import { afterEach, expect, test } from 'vitest';
import { examVocabularySeed } from './vocabularyCapture';
import { makeTextAnchor } from '../../domain/exam/annotations';
import { emptyState } from '../../domain/state';
import { addVocabularyItem, type VocabularyStore } from '../../domain/vocabulary';
import { examVocabularySourceUrl } from '../../domain/vocabulary/sources';
import type { ExamCatalog } from '../../domain/exam/types';

afterEach(() => { document.body.innerHTML = ''; });

test.each(['reading', 'listening'] as const)('%s collects clean vocabulary while retaining exact source wording and repeat-session identity', skill => {
  const text = 'The “island’s” well-known resources.';
  const blockId = skill === 'reading' ? 'passage:p:A' : 'sentence:one';
  const node = document.createElement('span'); node.dataset.sourceBlock = blockId; node.dataset.sourceVersion = '1'; node.textContent = text; document.body.append(node);
  const catalog = { sections: [{ id: 's', sentences: [{ id: 'one', text }] }], passages: [{ id: 'p', sectionId: 's', paragraphs: [{ id: 'A', text }] }] } as ExamCatalog;
  const selection = { quote: '“island’s”', anchors: [makeTextAnchor(blockId, text, 4, 14, '1')], context: text };
  const seed = examVocabularySeed(selection, { catalog, skill, sectionId: 's', attemptId: 'first' })!;
  expect(seed).toMatchObject({ term: 'island’s', category: 'word', example: text, sources: [{ context: text, exam: { quote: '“island’s”', start: 4, end: 14, attemptId: 'first' } }] });
  const state: VocabularyStore = emptyState();
  // Editing an inflection to its dictionary form must not lose the original quote or backlink.
  addVocabularyItem(state, { ...seed, term: 'island', meaning: 'Land surrounded by water.' });
  const repeated = examVocabularySeed(selection, { catalog, skill, sectionId: 's', attemptId: 'second' })!;
  addVocabularyItem(state, { ...repeated, term: 'island', meaning: 'Land surrounded by water.' });
  expect(state.vocabulary).toHaveLength(1);
  expect(state.vocabulary[0].sources.map(source => source.exam?.attemptId)).toEqual(['first', 'second']);
  const backlink = new URL(examVocabularySourceUrl(state.vocabulary[0].sources[0])!, 'https://example.test');
  expect(backlink.pathname).toBe(`/${skill}/source/s`);
  expect(backlink.searchParams.get('quote')).toBe('“island’s”');
  expect(backlink.searchParams.get('block')).toBe(blockId);
});

test('phrases are classified consistently and punctuation cannot open an empty capture', () => {
  const node = document.createElement('span'); node.dataset.sourceBlock = 'sentence:one'; node.textContent = 'A well-known resource.'; document.body.append(node);
  const context = { catalog: { sections: [{ id: 's', sentences: [{ id: 'one', text: node.textContent }] }] } as ExamCatalog, sectionId: 's', skill: 'listening' as const };
  const selection = { quote: 'well-known resource.', anchors: [makeTextAnchor('sentence:one', node.textContent, 2, node.textContent.length, '')], context: node.textContent };
  expect(examVocabularySeed(selection, context)).toMatchObject({ term: 'well-known resource', category: 'phrase' });
  expect(examVocabularySeed({ ...selection, quote: '…' }, context)).toBeNull();
});
