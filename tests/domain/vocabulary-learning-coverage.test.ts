import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { vocabularySensePresentation } from '../../src/domain/vocabulary/dictionaryPresentation';
import { getVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';
import { mergeVocabularyImport, parseVocabularyImport } from '../../src/domain/vocabulary/import';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));

test.each([
  ['reject', false], ['bound', false], ['reject', true], ['bound', true],
])('imported dictionary content for %s still receives public teaching (legacy format: %s)', (term, legacy) => {
  const previous = { ...VOCABULARY_CATALOG };
  Object.assign(VOCABULARY_CATALOG, catalog);
  try {
    const original = catalog.entries.find((entry: VocabularyEntry) => entry.term === term);
    const state: any = { vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] };
    const batch = parseVocabularyImport({ schemaVersion: 1, provider: 'dictionary', entries: [original] });
    if (legacy) batch.records[0].senses.forEach((sense: any) => {
      sense.usage ??= '';
      for (const field of ['distinctions', 'collocations', 'synonyms', 'antonyms']) sense[field] ??= [];
    });
    mergeVocabularyImport(state, batch);
    const saved = state.vocabulary[0];
    const before = structuredClone(saved);
    const resolved = resolveVocabularyLearningContext(saved, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-17-group-01' });
    if (term === 'bound') expect(resolved.sense?.id).toBe('kaikki:a7aaf730ed7146d84a');
    else expect(getVocabularyPronunciation(saved, resolved.sense).group?.id).toBe('reject-verb');
    expect(saved).toEqual(before);
    const personal = structuredClone(saved);
    personal.senses[0].example = 'My own sentence from class.';
    expect(resolveVocabularyLearningContext(personal, { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-17-group-01' }).sense?.example).toBe('My own sentence from class.');
  } finally {
    Object.assign(VOCABULARY_CATALOG, previous);
  }
});

test('selected public learning cards have a visible example in standalone and group study', () => {
  const previous = { ...VOCABULARY_CATALOG };
  Object.assign(VOCABULARY_CATALOG, catalog);
  try {
    const entries = new Map<string, VocabularyEntry>(catalog.entries.map((entry: VocabularyEntry) => [entry.id, entry]));
    const missing: string[] = [];
    for (const entry of entries.values()) {
      const resolved = resolveVocabularyLearningContext(entry);
      if (!resolved.sense || !vocabularySensePresentation(resolved.sense).example) missing.push(`${entry.term} (default)`);
    }
    for (const membership of catalog.memberships) {
      const entry = entries.get(membership.entryId)!;
      const resolved = resolveVocabularyLearningContext(entry, membership);
      if (!resolved.sense || !vocabularySensePresentation(resolved.sense).example) missing.push(`${entry.term} (${membership.unitId})`);
    }
    expect(missing).toEqual([]);
  } finally {
    Object.assign(VOCABULARY_CATALOG, previous);
  }
}, 120_000);
