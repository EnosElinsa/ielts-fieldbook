import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const initial = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const group = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-13-group-01' };
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(initial)));

function legacyEntry(term: string, provider: 'guixue' | 'wordbook'): VocabularyEntry {
  const entry: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === term));
  // Before optional fields were preserved, the importer/normalizer materialized
  // missing distinctions as []. This is published source data, not a user edit.
  entry.senses = entry.senses.map(sense => ({ ...sense, distinctions: sense.distinctions || [] }));
  entry.sources = [{ type: 'wordbook', ...group, id: provider === 'guixue'
    ? JSON.stringify(['guixue', 'synthetic-account', '10174', 'synthetic-unit', entry.id]) : `${group.bookId}:${group.unitId}:${entry.id}`,
    ...(provider === 'guixue' ? { context: `guixue account synthetic-account; source word ${entry.id}` } : {}) }];
  return entry;
}

test.each(['guixue', 'wordbook'] as const)('legacy %s records use the group meaning and example in display and practice', provider => {
  for (const [term, definition, example] of [
    ['parlour', 'A sitting room used for receiving guests or relaxing.', 'The family gathered in the parlour after dinner.'],
    ['eaves', 'The underside of a roof that extends beyond the external walls of a building.', 'Rainwater dripped from the eaves of the house.'],
  ]) {
    const entry = legacyEntry(term, provider);
    const before = structuredClone(entry);
    for (const request of [group, { ...group, senseId: entry.senses[0].id }]) {
      const resolved = resolveVocabularyLearningContext(entry, request);
      expect(resolved.sense).toMatchObject({ id: entry.senses[0].id, definition, example });
      expect(resolved.curriculumCurrent).toBe(true);
      const cards = getVocabularyReviewQueue({ vocabulary: [entry] }, { ...request, dueOnly: false, mode: 'definition' });
      expect(cards[0].entry.senses.find(sense => sense.id === cards[0].senseId)).toMatchObject({ definition, example });
    }
    expect(entry).toEqual(before);
  }
});

test('all words in the affected group resolve the same teaching from public and old imported snapshots', () => {
  for (const member of released.memberships.filter((row: typeof group) => row.bookId === group.bookId && row.unitId === group.unitId)) {
    const raw = released.entries.find((row: VocabularyEntry) => row.id === member.entryId);
    const current = resolveVocabularyLearningContext(raw, group);
    const imported = resolveVocabularyLearningContext(legacyEntry(raw.term, 'guixue'), group);
    expect(imported.sense, raw.term).toEqual(current.sense);
    expect(imported.curriculumCurrent, raw.term).toBe(current.curriculumCurrent);
  }
});

test.each(['definition', 'example', 'collocations', 'source'] as const)('legacy compatibility preserves a real personal %s edit', field => {
  const entry = legacyEntry('parlour', 'guixue');
  if (field === 'collocations') entry.senses[0].collocations = ['my family parlour'];
  else if (field === 'source') entry.senses[0].source = 'Personal note';
  else entry.senses[0][field] = 'My own family vocabulary note.';
  const before = structuredClone(entry);
  expect(resolveVocabularyLearningContext(entry, group).sense?.[field]).toEqual(entry.senses[0][field]);
  expect(entry).toEqual(before);
});

test('an unbound source cannot claim the legacy import compatibility path', () => {
  const entry = legacyEntry('parlour', 'guixue');
  entry.sources = [{ type: 'personal', id: 'my-note' }];
  entry.senses[0].definition = 'My own parlour meaning.';
  expect(resolveVocabularyLearningContext(entry, group).sense?.definition).toBe('My own parlour meaning.');
});

test.each(['example', 'collocations'] as const)('a deliberately cleared %s is not an untouched import', field => {
  const entry = legacyEntry('eaves', 'wordbook');
  entry.senses = [resolveVocabularyLearningContext(entry, group).sense!];
  if (field === 'example') entry.senses[0].example = '';
  else entry.senses[0].collocations = [];
  expect(resolveVocabularyLearningContext(entry, group).sense?.[field]).toEqual(entry.senses[0][field]);
});

test('an import marker inconsistent with its context cannot authorize content restoration', () => {
  const entry = legacyEntry('parlour', 'guixue');
  entry.sources[0].context = 'guixue account different-account; source word unrelated-word';
  expect(resolveVocabularyLearningContext(entry, group).sense?.definition).toBe(entry.senses[0].definition);
});
