import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { getVocabularyReviewQueue, normalizeVocabularyCollections } from '../../src/domain/vocabulary';
import { currentGroupLearningRef } from '../../src/domain/vocabulary/learningMeaningUpdate';
import { vocabularyCurriculum } from '../../src/domain/vocabulary/curriculum';
import { learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const initial = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const group = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-13-group-01' };
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(initial)));

const travel = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-14-group-01' };
const government = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-15-group-01' };

test('the architecture group teaches the architectural arch and preserves explicit older meanings', () => {
  const entry = legacyEntry('arch', 'wordbook');
  const original = resolveVocabularyLearningContext(entry).sense!;
  const resolved = resolveVocabularyLearningContext(entry, group);
  expect(resolved.sense).toMatchObject({
    id: 'kaikki:e1189a58e1b7de8b1f',
    pos: 'noun',
    example: 'A brick arch frames the entrance to the courtyard.',
  });
  expect(learningTask(resolved.entry, resolved.sense!, 'cloze')).toMatchObject({
    prompt: 'A brick _____ frames the entrance to the courtyard.',
    acceptedAnswers: ['arch'],
  });
  const previous = { entryId: entry.id, senseId: original.id };
  expect(resolveVocabularyLearningContext(entry, { ...group, senseId: original.id }).sense?.definition).toBe('An inverted U shape.');
  expect(currentGroupLearningRef({ vocabulary: [entry] }, group, previous).senseId).toBe(resolved.sense!.id);

  entry.senses.find(sense => sense.id === original.id)!.definition = 'The shape I noted in class.';
  expect(currentGroupLearningRef({ vocabulary: [entry] }, group, previous)).toEqual(previous);
});

test.each([
  ['organisation', 'A group of people working together for a particular purpose.', 'The organisation provides advice to local councils.'],
  ['association', 'A group of people organised for a shared purpose.', 'The association represents local government employees.'],
  ['union', 'A group of countries, states, or organisations joined for a shared purpose.', 'The two countries formed a union to coordinate trade policy.'],
  ['community', 'A group sharing common characteristics, such as the same language, law, religion, or tradition.', 'The local community shares a strong tradition of music and dance.'],
  ['throne', 'The position of a king or queen.', 'The prince succeeded to the throne after his father died.'],
])('government group teaches the contextual %s meaning from saved snapshots', (term, definition, example) => {
  const original = legacyEntry(term, 'guixue', government);
  const saved = normalizeVocabularyCollections({ vocabulary: [reviewedEntry(original)] }).vocabulary[0];
  if (term === 'organisation') {
    const legacy = corrections.find(row => row.entryId === original.id)?.previousSenses?.[0];
    expect(legacy?.definition).toBe('A standard British and Australian spelling of organization.');
    saved.senses[0] = legacy!;
  }
  const current = resolveVocabularyLearningContext(saved, government).sense!;
  expect(current).toMatchObject({ definition, example });
  const oldRef = { entryId: original.id, senseId: original.senses[0].id };
  expect(currentGroupLearningRef({ vocabulary: [saved] }, government, oldRef).senseId).toBe(current.id);
  expect(resolveVocabularyLearningContext(saved, { ...government, senseId: current.id }).sense).toMatchObject({ definition, example });
  const card = getVocabularyReviewQueue({ vocabulary: [saved] }, { ...government, senseId: current.id, dueOnly: false, mode: 'dictation' })[0];
  expect(card.entry.senses.find(sense => sense.id === card.senseId)).toMatchObject({ definition, example });
});

test('ordinary organisation lookup gives the institution meaning', () => {
  const original = legacyEntry('organisation', 'guixue', government);
  expect(resolveVocabularyLearningContext(original).sense?.definition).toBe('A group of people working together for a particular purpose.');
});

test('a personal edit to a saved public default stays visible in its group', () => {
  const original = legacyEntry('organisation', 'guixue', government);
  const saved = normalizeVocabularyCollections({ vocabulary: [reviewedEntry(original)] }).vocabulary[0];
  saved.senses[0].example = 'Our organisation holds a meeting every Monday.';
  const before = structuredClone(saved);
  expect(resolveVocabularyLearningContext(saved, government).sense?.example).toBe(saved.senses[0].example);
  expect(resolveVocabularyLearningContext(saved, { ...government, senseId: saved.senses[0].id }).sense?.example).toBe(saved.senses[0].example);
  expect(saved).toEqual(before);
});

test('express teaches the transport adjective in the travel group and retains the everyday verb outside it', () => {
  const entry = released.entries.find((row: VocabularyEntry) => row.term === 'express') as VocabularyEntry;
  const everyday = resolveVocabularyLearningContext(entry).sense!;
  const group = resolveVocabularyLearningContext(entry, travel).sense!;
  expect(everyday.id).toBe('kaikki:961f46e917baaeef40');
  expect(group).toMatchObject({ id: 'kaikki:cfaadb52f70626fec3', pos: 'adjective', example: 'The express train skips several local stops.' });
  expect(currentGroupLearningRef({ vocabulary: [entry] }, travel, { entryId: entry.id, senseId: everyday.id }).senseId).toBe(group.id);
});

test.each([
  ['airline', 'The airline added a direct flight to Madrid.'],
  ['route', 'The bus follows a different route on Sundays.'],
  ['passage', 'The sea passage from Dover to Calais was the shortest part of our journey.'],
  ['signpost', 'We followed the signpost pointing to the ferry terminal.'],
  ['vehicle', 'Only emergency vehicles can use this road.'],
  ['tram', 'We took the tram from the station to the city centre.'],
  ['wagon', 'A horse pulled the wagon loaded with supplies.'],
  ['brake', 'She slammed on the brakes when a cyclist pulled out in front of her.'],
])('%s uses the edited travel example even when an older imported card is saved', (term, example) => {
  const entry = legacyEntry(term, 'guixue', travel);
  const { sense } = resolveVocabularyLearningContext(entry, travel);
  expect(sense?.example).toBe(example);
  const card = getVocabularyReviewQueue({ vocabulary: [entry] }, { ...travel, senseId: sense!.id, dueOnly: false, mode: 'definition' })[0];
  expect(card.entry.senses.find(row => row.id === card.senseId)?.example).toBe(example);
});

function legacyEntry(term: string, provider: 'guixue' | 'wordbook', scope = group): VocabularyEntry {
  const entry: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === term));
  // Before optional fields were preserved, the importer/normalizer materialized
  // missing distinctions as []. This is published source data, not a user edit.
  entry.senses = entry.senses.map(sense => ({ ...sense, distinctions: sense.distinctions || [] }));
  entry.sources = [{ type: 'wordbook', ...scope, id: provider === 'guixue'
    ? JSON.stringify(['guixue', 'synthetic-account', '10174', 'synthetic-unit', entry.id]) : `${scope.bookId}:${scope.unitId}:${entry.id}`,
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

test('old imported group cards and recorded syllabus replacements match current public teaching across wordbooks', { timeout: 20_000 }, () => {
  const entries = new Map<string, VocabularyEntry>(released.entries.map((entry: VocabularyEntry) => [entry.id, entry]));
  for (const { bookId, unitId, entryId } of released.memberships) {
    const scope = { bookId, unitId };
    const entry = entries.get(entryId)!;
    const imported = {
      ...entry,
      sources: [{ type: 'wordbook' as const, ...scope, id: `${bookId}:${unitId}:${entryId}` }],
      senses: entry.senses.map(sense => ({ ...sense, distinctions: sense.distinctions || [] })),
    };
    const current = resolveVocabularyLearningContext(entry, scope).sense;
    const actual = resolveVocabularyLearningContext(imported, scope).sense;
    if (actual?.id !== current?.id || actual?.definition !== current?.definition || actual?.example !== current?.example) {
      throw new Error(`Imported teaching differs for ${entry.term} in ${unitId}`);
    }
    const original = entry.senses[0];
    const correction = vocabularyCurriculum(entry, scope, original)?.rows.find(row =>
      row.originalSense?.id === original.id && row.sense.id === current?.id && row.sense.id !== original.id);
    if (correction) {
      const ref = currentGroupLearningRef({ vocabulary: [imported] }, scope, { entryId, senseId: original.id });
      expect(ref.senseId, `${entry.term} in ${unitId}`).toBe(correction.sense.id);
    }
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
