import { afterEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { getVocabularyLearningPriority, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { registerVocabularyTeaching, vocabularyTeaching } from '../../src/domain/vocabulary/runtimeData';
import { hasVocabularySenseEdits } from '../../src/domain/vocabulary/content';
import type { VocabularySense } from '../../src/domain/vocabulary/types';

const corrections = vocabularyTeaching.readiness.corrections;
afterEach(() => {
  vocabularyTeaching.readiness.corrections = corrections;
  registerVocabularyTeaching(vocabularyTeaching);
});
const source: VocabularySense = { id: 'priority-test', definition: 'A public meaning.', example: 'A public example.', pos: 'noun', source: 'English Wiktionary' };
function register(category: string) {
  registerVocabularyTeaching({ ...vocabularyTeaching, readiness: { ...vocabularyTeaching.readiness, corrections: [
    { entryId: 'priority-entry', senseId: source.id, originalSense: source, definition: source.definition, example: source.example, learningPriority: category } as any,
  ] } });
}

test.each(['general', 'specialist', 'historical', 'proper-name'])('authored %s priority requires the exact entry, definition and part of speech', category => {
  register(category);
  expect(getVocabularyLearningPriority('priority-entry', source)).toBe(category);
  expect(getVocabularyLearningPriority('other-entry', source)).toBeUndefined();
  expect(getVocabularyLearningPriority('priority-entry', { ...source, id: 'other' })).toBeUndefined();
  expect(getVocabularyLearningPriority('priority-entry', { ...source, definition: 'A personal definition.' })).toBeUndefined();
  expect(getVocabularyLearningPriority('priority-entry', { ...source, pos: 'verb' })).toBeUndefined();
  expect(getVocabularyLearningPriority('priority-entry', { ...source, source: 'Personal note' })).toBeUndefined();
  expect(getVocabularyLearningPriority('priority-entry', { ...source, example: 'My classroom example.' })).toBe(category);
});

test('priority is not inferred from reading notes, terminology or diagram readiness and follows teaching revisions', () => {
  expect(getVocabularyLearningPriority('priority-entry', { ...source, usage: 'Technical, obsolete.', example: 'A specialist reading note.' })).toBeUndefined();
  register('general');
  expect(getVocabularyLearningPriority('priority-entry', source)).toBe('general');
  register('specialist');
  expect(getVocabularyLearningPriority('priority-entry', source)).toBe('specialist');
  register('guessed');
  expect(getVocabularyLearningPriority('priority-entry', source)).toBeUndefined();
});

const matrix: Record<string, string[]> = {
  effective: ['general','general','general','general','specialist','specialist','specialist','specialist'],
  efficient: ['general','specialist','specialist','historical','historical'],
  sensible: ['general','general','specialist',...Array(7).fill('historical')],
  sensitive: ['specialist',...Array(6).fill('general'),'specialist','historical','specialist'],
};
test.each(Object.entries(matrix))('%s priorities are authored for each reviewed source meaning without entering learner snapshots', (term, priorities) => {
  const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  const entry = catalog.entries.find((entry: any) => entry.term === term);
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
  const dictionary = JSON.parse(readFileSync(`public/dictionary/${index[term]}`, 'utf8'));
  const before = structuredClone(dictionary);
  expect(dictionary.senses).toHaveLength(priorities.length);
  dictionary.senses.forEach((raw: VocabularySense, at: number) => {
    const sense = supplementVocabularySense(entry.id, raw, [raw], hasVocabularySenseEdits);
    expect(getVocabularyLearningPriority(entry.id, sense), `${term}/${raw.id}`).toBe(priorities[at]);
    expect(sense).not.toHaveProperty('learningPriority');
    expect(getVocabularyLearningPriority(entry.id, { ...sense, definition: raw.definition + ' Personal.' })).toBeUndefined();
  });
  expect(dictionary).toEqual(before);
});
