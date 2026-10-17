import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { isVocabularyMeaningGroup, isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['support', 'post', 'figure', 'note'];
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string) => catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
const raw = (term: string, at: number) => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses[at] as VocabularySense;
const teaching = (term: string, at: number) => supplementVocabularySense(entry(term).id, raw(term, at), [raw(term, at)], hasVocabularySenseEdits);
const child = (term: string, pattern: RegExp) => {
  const row = corrections.find(row => row.entryId === entry(term).id && row.dictionaryParentSenseId && pattern.test(row.definition || ''));
  const source = sources.find(source => source.term === term && source.sense.id === row?.senseId);
  expect(source, `${term}: ${pattern}`).toBeDefined();
  return supplementVocabularySense(entry(term).id, source!.sense as VocabularySense, [source!.sense as VocabularySense], hasVocabularySenseEdits);
};

test.each(terms)('%s preserves independent personal content when public teaching changes', term => {
  const base = entry(term), personal = { ...base.senses[0], example: 'An independent example from our classroom.' };
  expect(supplementVocabularySense(base.id, personal, [base.senses[0]], hasVocabularySenseEdits)).toEqual(personal);
});

test('initial meanings use backing, an appointed job, an information diagram and a concrete reminder', () => {
  expect(reviewedEntry(entry('support')).senses[0].definition).toMatch(/favour or back/);
  expect(reviewedEntry(entry('post')).senses[0].definition).toMatch(/appointed job/);
  expect(reviewedEntry(entry('figure')).senses[0].definition).toMatch(/diagram that conveys information/);
  expect(reviewedEntry(entry('note')).senses[0].definition).toMatch(/written record.*remember/);
  expect(reviewedEntry(entry('note')).senses[0].id).toMatch(/^wiktionary:restored:/);
});

test('support separates evidence, financial help, product help and compatibility', () => {
  expect(teaching('support', 4).distinctions?.join(' ')).toMatch(/without proving it conclusively/);
  expect(teaching('support', 7).distinctions?.join(' ')).toMatch(/compatibility/);
  expect(teaching('support', 8).distinctions?.join(' ')).toMatch(/does not mean.*continuing customer assistance/);
  expect(teaching('support', 12).distinctionTask?.answer).toBe('support');
  expect(isVocabularyMeaningGroup(entry('support').id, teaching('support', 11))).toBe(false);
});

test('mathematical support states its convention and distinguishes positive membership from closure', () => {
  expect(teaching('support', 14).example).toMatch(/\(0, 1\).*\[0, 1\]/);
  expect(teaching('support', 14).distinctions?.join(' ')).toMatch(/does not mean.*nonzero values at every point/);
  expect(teaching('support', 15).definition).toMatch(/greater than zero/);
  expect(teaching('support', 16).example).toContain('M_p ≠ 0');
});

test('post keeps postal service and a batch of delivered items as preserved meanings without duplicate restoration', () => {
  expect(teaching('post', 15).definition).toMatch(/service that delivers/);
  expect(teaching('post', 16).definition).toMatch(/batch of letters/);
  const restored = sources.filter(row => row.term === 'post');
  expect(restored).toHaveLength(9);
  expect(restored.some(row => /organisation for delivering|single delivery of letters/i.test(row.sense.definition))).toBe(false);
});

test('post distinguishes a temporal boundary, a deposit and successful startup checks', () => {
  expect(teaching('post', 32).distinctionTask?.answer).toBe('after');
  expect(teaching('post', 32).distinctions?.join(' ')).toMatch(/does not give an exact/);
  expect(teaching('post', 10).distinctions?.join(' ')).toMatch(/does not promise a refund/);
  expect(teaching('post', 35).definition).toMatch(/^POST: power-on self-test/);
  expect(teaching('post', 36).distinctions?.join(' ')).toMatch(/does not guarantee.*operating-system/);
  expect(child('post', /provide bail/).distinctions?.join(' ')).toMatch(/not a finding of innocence/);
});

test('Post place names and POST retain distinct case-sensitive revision evidence', () => {
  const rows = corrections.filter(row => row.entryId === entry('post').id);
  const acronym = rows.find(row => row.senseId === raw('post', 35).id)!;
  const surname = rows.find(row => row.senseId === raw('post', 38).id)!;
  expect(acronym.referenceUrl).toMatch(/title=POST&oldid=85356422$/);
  expect(surname.referenceUrl).toMatch(/title=Post&oldid=93140700$/);
  expect(teaching('post', 40).definition).toContain('Oregon');
  expect(teaching('post', 41).definition).toContain('Texas');
});

test('figure distinguishes written numerals, whole amounts, dance links and logical arrangement', () => {
  expect(teaching('figure', 6).distinctions?.join(' ')).toMatch(/507.*three.*digits/);
  expect(teaching('figure', 7).distinctions?.join(' ')).toMatch(/240.*one attendance figure.*three decimal digits/);
  expect(teaching('figure', 10).definition).not.toContain('ᵂ');
  expect(teaching('figure', 12).distinctions?.join(' ')).toMatch(/subject of the major premise.*predicate of the minor/);
  expect(teaching('figure', 27).distinctions?.join(' ')).toMatch(/relative to the bass/);
});

test('note source directories are references while each restored reminder, payment and sound stays selectable', () => {
  for (const at of [0, 1, 2]) {
    const sense = teaching('note', at);
    expect(isVocabularyMeaningGroup(entry('note').id, sense)).toBe(true);
    for (const mode of ['definition', 'cloze', 'synonym', 'distinction']) expect(learningTask(entry('note'), sense, mode)).toBeUndefined();
  }
  const reminder = child('note', /written record.*remember/), currency = child('note', /polymer currency/), promise = child('note', /promising payment/);
  expect(isVocabularyMeaningGroup(entry('note').id, reminder)).toBe(false);
  expect(learningTask(entry('note'), reminder, 'cloze')).toBeDefined();
  expect(currency.distinctionTask?.answer).toBe('note');
  expect(promise.distinctions?.join(' ')).toMatch(/does not guarantee payment/);
});

test('written musical characters, their sound and a keyboard key are distinct meanings', () => {
  expect(child('note', /written musical character/).distinctions?.join(' ')).toMatch(/relative.*tempo/);
  expect(child('note', /musical tone or sounded/).distinctions?.join(' ')).toMatch(/physical control/);
  expect(child('note', /key on a piano/).distinctions?.join(' ')).toMatch(/physical key/);
  expect(teaching('note', 17).distinctions?.join(' ')).toMatch(/requests a quotation/);
});

test('all new reading explanations stay out of sentence gaps while independent examples remain personal', () => {
  const rows = corrections.filter(row => terms.some(term => entry(term).id === row.entryId) && row.exampleKind === 'reading-note');
  expect(rows).toHaveLength(72);
  for (const row of rows) {
    const base = catalog.entries.find((entry: VocabularyEntry) => entry.id === row.entryId) as VocabularyEntry;
    const sense = supplementVocabularySense(base.id, row.originalSense as VocabularySense, [row.originalSense as VocabularySense], hasVocabularySenseEdits);
    expect(isVocabularyReadingNote(base.id, sense), row.senseId).toBe(true);
    expect(learningTask(base, sense, 'cloze'), row.senseId).toBeUndefined();
    expect(isVocabularyReadingNote(base.id, { ...sense, example: 'An independent example written by the learner.' })).toBe(false);
  }
});
