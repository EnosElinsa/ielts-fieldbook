import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { vocabularyTeaching } from '../../src/domain/vocabulary/runtimeData';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyPronunciation, freezeVocabularyPronunciation, isFrozenVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import { comparablePartOfSpeech as pos, publishedCurriculumSenseIds } from '../../src/domain/vocabulary/publishedSenseIdentity';
import registry from '../../src/domain/vocabulary/sensePronunciations.json';
import senseDiagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8')) as { entries: VocabularyEntry[] };
const entries = new Map(catalog.entries.map(entry => [entry.id, entry]));
const curriculumRows = Object.values(vocabularyTeaching.curriculum).flat();
const key = (entryId: string, sense: VocabularySense) => JSON.stringify([entryId, sense.id, sense.pos, sense.definition]);

/** Published curriculum meanings whose wording drifted from the exact reviewed pronunciation binding. */
const driftedPronunciation = (() => {
  const result = new Map<string, { entry: VocabularyEntry; sense: VocabularySense; expected: string }>();
  const isDictionaryId = (id: string) => /^(?:kaikki|wiktionary):/.test(id);
  for (const row of curriculumRows) {
    const bindings = registry.bindings.filter(binding => binding.entryId === row.entryId);
    if (!bindings.length || bindings.some(binding => binding.senseId === row.sense.id && binding.definition === row.sense.definition && binding.pos === row.sense.pos)) continue;
    const ids = [row.sense.id, ...(!isDictionaryId(row.sense.id) && row.originalSense && pos(row.originalSense.pos) === pos(row.sense.pos) ? [row.originalSense.id] : [])];
    const binding = bindings.find(candidate => ids.includes(candidate.senseId) && pos(candidate.pos) === pos(row.sense.pos));
    if (binding) result.set(key(row.entryId, row.sense), { entry: entries.get(row.entryId)!, sense: row.sense, expected: binding.groupId });
  }
  return result;
})();

test('unmodified reworded curriculum meanings keep the verified reading of the meaning they teach', () => {
  expect(driftedPronunciation.size).toBeGreaterThanOrEqual(14);
  const terms = new Set<string>();
  for (const { entry, sense, expected } of driftedPronunciation.values()) {
    const result = getVocabularyPronunciation(entry, sense);
    expect(result.binding, `${entry.term}: ${sense.definition}`).toBeDefined();
    expect(result.group?.id).toBe(expected);
    expect(result.required).toBe(true);
    terms.add(entry.term);
  }
  for (const term of ['resolve', 'permit', 'suspect', 'refuse', 'minute', 'subject', 'object', 'survey', 'present', 'record']) expect(terms.has(term), term).toBe(true);
});

test('a reworded curriculum meaning freezes and revalidates its pronunciation binding', () => {
  const { entry, sense, expected } = [...driftedPronunciation.values()].find(item => item.entry.term === 'resolve')!;
  const frozen = freezeVocabularyPronunciation(entry, sense);
  expect(frozen).toMatchObject({ version: 1 });
  expect(getVocabularyPronunciation(entry, sense, frozen).group?.id).toBe(expected);
  expect(isFrozenVocabularyPronunciation(frozen, entry, sense)).toBe(true);
  expect(isFrozenVocabularyPronunciation(frozen, entry, { ...sense, definition: 'My own wording.' })).toBe(false);
});

test.each(['definition', 'pos', 'id', 'source'] as const)('a learner-edited %s on a reworded meaning does not inherit pronunciation', field => {
  for (const { entry, sense } of driftedPronunciation.values()) {
    const edited = { ...sense, [field]: field === 'source' ? 'Personal note' : `${sense[field]} edited` } as VocabularySense;
    expect(getVocabularyPronunciation(entry, edited).binding, `${entry.term} ${field}`).toBeUndefined();
  }
});

test('a modified source label is not an unmodified published meaning', () => {
  const { entry, sense } = [...driftedPronunciation.values()][0];
  expect(publishedCurriculumSenseIds(entry.id, sense).length).toBeGreaterThan(0);
  expect(publishedCurriculumSenseIds(entry.id, { ...sense, source: 'Something else' })).toEqual([]);
  expect(publishedCurriculumSenseIds(entry.id, undefined)).toEqual([]);
});

test.each(['wind', 'bow'])('unreviewed homograph %s stays unreviewed with curriculum content', term => {
  const entry = catalog.entries.find(item => item.term === term)!;
  for (const row of curriculumRows.filter(candidate => candidate.entryId === entry.id)) {
    expect(getVocabularyPronunciation(entry, row.sense)).toMatchObject({ required: true, recordings: [] });
    expect(getVocabularyPronunciation(entry, row.sense).binding).toBeUndefined();
  }
});

/** Published curriculum meanings whose wording drifted from the reviewed diagram of the same sense. */
const driftedDiagrams = (() => {
  const result = new Map<string, { entry: VocabularyEntry; sense: VocabularySense; senseId: string }>();
  for (const row of curriculumRows) {
    const diagrams = senseDiagrams.filter(diagram => diagram.entryId === row.entryId && pos(diagram.pos) === pos(row.sense.pos));
    if (!diagrams.length || diagrams.some(diagram => diagram.senseId === row.sense.id && diagram.definition === row.sense.definition)) continue;
    const diagram = diagrams.find(candidate => candidate.senseId === row.sense.id);
    if (diagram) result.set(key(row.entryId, row.sense), { entry: entries.get(row.entryId)!, sense: row.sense, senseId: diagram.senseId });
  }
  return result;
})();

test('unmodified reworded curriculum meanings keep their verified diagrams', () => {
  expect(driftedDiagrams.size).toBeGreaterThanOrEqual(64);
  const terms = new Set<string>();
  for (const { entry, sense, senseId } of driftedDiagrams.values()) {
    expect(getVocabularySenseDiagram({ entry, sense })?.senseId, `${entry.term}: ${sense.definition}`).toBe(senseId);
    terms.add(entry.term);
  }
  for (const term of ['education', 'experiment', 'project', 'data', 'require', 'propose', 'reflect']) expect(terms.has(term), term).toBe(true);
});

test('replaced curriculum meanings show their own diagram and never inherit the replaced originalSense diagram', () => {
  const byTermAndUnit = (term: string, unitId: string) =>
    curriculumRows.find(row => row.unitId === unitId && entries.get(row.entryId)?.term === term)!;

  for (const [term, unitId, expectedKind] of [
    ['require', 'ielts-vocabulary-chapter-17-group-02', 'require-action'],
    ['propose', 'ielts-vocabulary-chapter-19-group-02', 'propose-marriage'],
    ['reflect', 'ielts-vocabulary-chapter-20-group-01', 'reflect-consider'],
    ['anticipate', 'ielts-vocabulary-chapter-09-group-01', 'anticipate-forecast'],
    ['suggest', 'ielts-vocabulary-chapter-15-group-02', 'suggest-propose'],
    ['claim', 'ielts-vocabulary-chapter-15-group-02', 'claim-assertion'],
    ['earn', 'ielts-vocabulary-chapter-16-group-03', 'earn-income'],
  ] as const) {
    const row = byTermAndUnit(term, unitId);
    const entry = entries.get(row.entryId)!;
    const diagram = getVocabularySenseDiagram({ entry, sense: row.sense });
    expect(diagram?.senseId, term).toBe(row.sense.id);
    expect(diagram?.kind, term).toBe(expectedKind);
    expect(publishedCurriculumSenseIds(entry.id, row.sense)).toEqual([row.sense.id]);
  }

  for (const [term, unitId] of [
    ['impact', 'ielts-vocabulary-chapter-02-group-02'],
    ['lay', 'ielts-vocabulary-chapter-03-group-01'],
    ['presume', 'ielts-vocabulary-chapter-05-group-07'],
    ['conclude', 'ielts-vocabulary-chapter-05-group-07'],
    ['contrast', 'ielts-vocabulary-chapter-05-group-07'],
    ['figure', 'ielts-vocabulary-chapter-11-group-02'],
    ['matter', 'ielts-vocabulary-chapter-18-group-03'],
  ] as const) {
    const row = byTermAndUnit(term, unitId);
    const entry = entries.get(row.entryId)!;
    expect(getVocabularySenseDiagram({ entry, sense: row.sense }), `${term} must not inherit ${row.originalSense?.id}`).toBeUndefined();
  }
});

test.each(['definition', 'pos', 'id', 'source'] as const)('a learner-edited %s on a reworded meaning does not inherit a diagram', field => {
  for (const { entry, sense } of driftedDiagrams.values()) {
    const edited = { ...sense, [field]: field === 'source' ? 'Personal note' : `${sense[field]} edited` } as VocabularySense;
    expect(getVocabularySenseDiagram({ entry, sense: edited }), `${entry.term} ${field}`).toBeUndefined();
  }
});

test('exact diagram and pronunciation matches are unchanged', () => {
  for (const diagram of senseDiagrams.slice(0, 40)) {
    const entry = entries.get(diagram.entryId)!;
    const sense = { id: diagram.senseId, definition: diagram.definition, pos: diagram.pos, example: '' } as VocabularySense;
    expect(getVocabularySenseDiagram({ entry: { ...entry, term: diagram.term }, sense })).toMatchObject({ entryId: diagram.entryId, senseId: diagram.senseId, definition: diagram.definition });
  }
});
