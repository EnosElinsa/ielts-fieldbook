import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { normalizeVocabularyCollections } from '../../src/domain/vocabulary';
import { reviewedEntry } from '../../src/domain/vocabulary/content';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import topicsB from '../../src/domain/vocabulary/groupCurriculumTopicsB.json';
import revisions from '../../src/domain/vocabulary/resourceDictionaryRevisions.json';
import baseline from '../../src/domain/vocabulary/resourceAuditFixesBaseline.json';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const initial = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(initial)));

const clothing = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-11-group-02' };
const listening = { bookId: 'ielts-listening-essentials', unitId: 'ielts-listening-essentials-chapter-05-group-01' };
const fightId = 've-a34f2f1';
const greyId = 've-7c6ebecc';

const oldFight = {
  definition: 'A physical conflict in which people or animals try to hurt one another.',
  example: 'The argument ended in a fight outside the station.',
};
const oldGrey = {
  definition: 'A neutral colour between black and white.',
  example: 'The jacket is a pale shade of grey.',
};
const newFight = {
  definition: 'To take part in a physical struggle or battle against an opponent.',
  example: 'Soldiers fought the invading army for three days.',
};
const newGrey = {
  definition: 'Of a neutral colour between black and white.',
  example: 'She chose a pale grey jacket for the interview.',
};

function entryFor(id: string, scope: { bookId: string; unitId: string }): VocabularyEntry {
  const entry: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.id === id));
  entry.senses = entry.senses.map(sense => ({ ...sense, distinctions: sense.distinctions || [] }));
  entry.sources = [{ type: 'wordbook', ...scope, id: `${scope.bookId}:${scope.unitId}:${entry.id}` }];
  return entry;
}

test('fight teaches a verb definition and example that match its verb part of speech', () => {
  const row = corrections.find(item => item.entryId === fightId)!;
  expect(row).toMatchObject({ ...newFight, pos: 'verb', originalSense: { pos: 'verb', register: 'transitive' } });
  const sense = resolveVocabularyLearningContext(entryFor(fightId, listening), listening).sense!;
  expect(sense).toMatchObject({ ...newFight, pos: 'verb', register: 'transitive' });
  // The example contains an inflected form of the headword, used as the verb the definition describes.
  expect(sense.example).toMatch(/\bfought\b/);
  expect(sense.definition).toMatch(/^To /);
});

test('grey teaches an adjective definition and example that match its adjective part of speech', () => {
  const row = topicsB.find(item => item.entryId === greyId)!;
  expect(row.sense).toMatchObject({ ...newGrey, pos: 'adj' });
  const sense = resolveVocabularyLearningContext(entryFor(greyId, clothing), clothing).sense!;
  expect(sense).toMatchObject({ ...newGrey, pos: 'adj' });
  expect(sense.definition).toMatch(/^Of /);
  // The old example used grey as a noun ("a shade of grey") under an adjective sense.
  expect(sense.example).not.toMatch(/shade of grey/);
  expect(sense.example).toMatch(/\bgrey jacket\b/);
});

test.each([
  ['fight', fightId, listening, oldFight, newFight],
  ['grey', greyId, clothing, oldGrey, newGrey],
] as const)('a saved %s lesson holding the previous public text is upgraded, while a personal edit is kept', (_term, id, scope, previous, next) => {
  const original = entryFor(id, scope);
  const saved = normalizeVocabularyCollections({ vocabulary: [reviewedEntry(original)] }).vocabulary[0];
  // An untouched saved dictionary snapshot resolves to the corrected group meaning.
  expect(resolveVocabularyLearningContext(saved, scope).sense).toMatchObject(next);
  // So does a snapshot that holds the exact previously published group meaning.
  const row = id === fightId ? corrections.find(item => item.entryId === id)! : topicsB.find(item => item.entryId === id)!;
  saved.senses[0] = structuredClone(row.previousSenses![0]) as typeof saved.senses[0];
  expect(saved.senses[0]).toMatchObject(previous);
  expect(resolveVocabularyLearningContext(saved, scope).sense).toMatchObject(next);
  const edited = structuredClone(saved);
  edited.senses[0].example = 'My own example sentence.';
  expect(resolveVocabularyLearningContext(edited, scope).sense?.example).toBe('My own example sentence.');
});

test('previous fight and grey content is retained as previousSenses and in the rollback baseline', () => {
  const fight = corrections.find(item => item.entryId === fightId)!;
  const grey = topicsB.find(item => item.entryId === greyId)!;
  expect(fight.previousSenses).toHaveLength(1);
  expect(fight.previousSenses![0]).toMatchObject({ id: fight.senseId, pos: 'verb', ...oldFight });
  expect(grey.previousSenses).toHaveLength(1);
  expect(grey.previousSenses![0]).toEqual({ ...grey.sense, ...oldGrey });

  expect(revisions[0]).toBe('resourceAuditFixesBaseline');
  expect(new Set(revisions).size).toBe(revisions.length);
  expect(baseline.removeCorrections).toEqual([]);
  expect(baseline.removeTopics).toEqual([]);
  expect(baseline.restoreCorrections).toHaveLength(1);
  expect(baseline.restoreTopicRows).toHaveLength(1);
  // The baseline holds the exact objects that produced the previous immutable URLs.
  expect(baseline.restoreCorrections[0]).toEqual({
    entryId: fightId, senseId: fight.senseId, ...oldFight,
    originalSense: fight.originalSense,
  });
  expect(Object.keys(baseline.restoreCorrections[0])).toEqual(['entryId', 'senseId', 'definition', 'example', 'originalSense']);
  expect(baseline.restoreTopicRows[0]).toEqual({
    bookId: grey.bookId, unitId: grey.unitId, entryId: greyId, term: 'grey',
    sense: grey.previousSenses![0], originalSense: grey.originalSense, reason: grey.reason,
  });
});

test('default-scope explicit senseId keeps repaired definitions for democracy, cock, bull, paste and accommodation while honoring personal edits', () => {
  for (const [term, pattern] of [
    ['democracy', /voting|leaders/i],
    ['cock', /male chicken/i],
    ['bull', /male bovine/i],
    ['paste', /mixture/i],
    ['accommodation', /Lodging in a dwelling/i],
  ] as const) {
    const raw: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === term));
    const senseId = raw.senses[0].id;
    const withoutSense = resolveVocabularyLearningContext(raw);
    const withSense = resolveVocabularyLearningContext(raw, { senseId });
    expect(withoutSense.sense?.definition, term).toMatch(pattern);
    expect(withSense.sense?.definition, term).toMatch(pattern);
    expect(withSense.sense, term).toEqual(withoutSense.sense);
    const edited = structuredClone(raw);
    edited.senses[0].definition = `Personal ${term} definition.`;
    expect(resolveVocabularyLearningContext(edited, { senseId }).sense?.definition).toBe(`Personal ${term} definition.`);
  }
});

test('collecting steward verb dictionary sense does not hijack Transport and travel Group 1', () => {
  const raw: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === 'steward'));
  const verbSense = {
    id: 'kaikki:c20fd686aa0d8300ef',
    pos: 'verb',
    definition: 'To act as the steward or caretaker of (something).',
    example: 'Volunteers stewarded the reserve.',
    source: 'English Wiktionary via Kaikki.org',
    sourceUrl: 'https://en.wiktionary.org/wiki/steward#English',
    license: 'CC-BY-SA-4.0',
  };
  const collected: VocabularyEntry = {
    ...raw,
    senses: [verbSense, ...raw.senses],
    sources: [{ type: 'personal', id: `dictionary:${verbSense.id}`, senseId: verbSense.id }],
  };
  const transport = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-14-group-01' };
  const resolved = resolveVocabularyLearningContext(collected, transport);
  expect(resolved.sense?.pos).toBe('noun');
  expect(resolved.sense?.definition).toMatch(/ship.*officer/i);
  // Standalone default view keeps the verb meaning the learner explicitly collected.
  expect(resolveVocabularyLearningContext(collected).sense?.id).toBe(verbSense.id);
});

test('assessing complex in one wordbook group does not contaminate another multi-meaning group', () => {
  const raw: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === 'complex'));
  const langScope = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-08-group-01' };
  const multiScope = { bookId: 'ielts-listening-essentials', unitId: 'ielts-listening-essentials-chapter-04-group-01' };
  const langResolved = resolveVocabularyLearningContext(raw, langScope);
  const afterGroupA = normalizeVocabularyCollections({ vocabulary: [{ ...raw, senses: [structuredClone(langResolved.sense!), ...raw.senses.filter(s => s.id !== langResolved.sense!.id)] }] }).vocabulary[0];
  const groupB = resolveVocabularyLearningContext(afterGroupA, multiScope);
  expect(groupB.curriculumCurrent).toBe(true);
  expect(groupB.sense?.id).not.toBe(langResolved.sense?.id);
});

test('fundamental keeps the listening-vocabulary overlay instead of leaking reading-keywords when senseId is requested', () => {
  const raw: VocabularyEntry = structuredClone(released.entries.find((row: VocabularyEntry) => row.term === 'fundamental'));
  const scope = { bookId: 'ielts-listening-vocabulary', unitId: 'ielts-listening-vocabulary-chapter-02-group-02' };
  const withoutSense = resolveVocabularyLearningContext(raw, scope);
  const withSense = resolveVocabularyLearningContext(raw, { ...scope, senseId: withoutSense.sense!.id });
  expect(withSense.sense?.definition).toBe(withoutSense.sense?.definition);
  expect(withSense.sense?.example).toBe(withoutSense.sense?.example);
  expect(withSense.sense?.distinctions).toEqual(withoutSense.sense?.distinctions);
});
