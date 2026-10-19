import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { getVocabularyLearningPriority, isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { freezeVocabularyPronunciation, getVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
function selected(term: string, id: string) {
  const entry: VocabularyEntry = catalog.entries.find((row: VocabularyEntry) => row.term === term);
  const raw: VocabularySense = JSON.parse(readFileSync(`public/dictionary/${index[term]}`, 'utf8')).senses.find((row: VocabularySense) => row.id === id);
  const sense = supplementVocabularySense(entry.id, raw, [], hasVocabularySenseEdits);
  return { entry: { ...entry, senses: [sense] }, sense, raw };
}

test('discount selects its disregard recording by meaning while its retail verb has IPA without borrowing noun audio', () => {
  const disregard = selected('discount', 'kaikki:0f0c4d9616b9da6402');
  const retail = selected('discount', 'kaikki:d9dfbbdde5eccbbc0b');
  expect(getVocabularyPronunciation(disregard.entry, disregard.sense)).toMatchObject({
    required: true, group: { id: 'discount-disregard', ipa: { uk: '/dɪˈskaʊnt/' } },
    recordings: [{ accent: 'uk', fileSha1: 'bf257cb261ce6a7d67297ee9f3ee56f45839787b' }],
  });
  expect(getVocabularyPronunciation(retail.entry, retail.sense)).toMatchObject({
    required: true, group: { id: 'discount-other-verbs', ipa: { uk: '/ˈdɪskaʊnt/' } }, recordings: [],
  });
});

test.each([
  ['kaikki:58e6bd082054859eeb', 'survey-noun', 'ef83de486f3bb199edca66365fd4fbb71d0d65fc', '/ˈsɜːveɪ/ · /sɜːˈveɪ/'],
  ['kaikki:84c4e501a6bc8681da', 'survey-verb', 'e0cef6219b39bd86a05dd259ada0dad733601a7f', '/səˈveɪ/ · /sɜːˈveɪ/ · /ˈsɜːveɪ/'],
])('survey %s keeps source variants and its own recorded word class', (id, group, sha1, ipa) => {
  const { entry, sense } = selected('survey', id);
  expect(getVocabularyPronunciation(entry, sense)).toMatchObject({ required: true, group: { id: group, ipa: { uk: ipa } }, recordings: [{ accent: 'uk', fileSha1: sha1 }] });
});

test('discount nominal audio is exact, personal wording is unbound and a frozen missing match stays missing', () => {
  const { entry, sense } = selected('discount', 'kaikki:d741a2ffee17dc9a2d');
  expect(getVocabularyPronunciation(entry, sense).recordings[0]).toMatchObject({ accent: 'us', fileSha1: '643f598a8e7bc9b26d5aeb69c7caf29135576b94' });
  expect(getVocabularyPronunciation(entry, { ...sense, definition: 'My own meaning.' })).toMatchObject({ required: true, recordings: [] });
  expect(getVocabularyPronunciation(entry, { ...sense, source: 'Personal note' }).binding).toBeUndefined();
  expect(freezeVocabularyPronunciation(entry, sense)).toHaveProperty('bindingId');
  expect(getVocabularyPronunciation(entry, sense, { version: 1, bindingId: null }).recordings).toEqual([]);
  expect(getVocabularyPronunciation(entry, sense, 'legacy')).toMatchObject({ legacy: true, recordings: [] });
});

test('survey measuring work and its resulting plan produce different exact-meaning questions', () => {
  const operation = selected('survey', 'kaikki:6429f56f5de947c29b');
  const plan = selected('survey', 'kaikki:295aee5c78c7abe688');
  expect(learningTask(operation.entry, operation.sense, 'distinction')?.acceptedAnswers).toEqual(['the measuring operation']);
  expect(learningTask(plan.entry, plan.sense, 'distinction')?.acceptedAnswers).toEqual(['the measured plan and description']);
});

test('discount finance exercises distinguish a monetary deduction from an interest rate', () => {
  const amount = selected('discount', 'kaikki:df21902a8714644bd9');
  const rate = selected('discount', 'kaikki:d4c97cc8438045ab9d');
  expect(learningTask(amount.entry, amount.sense, 'distinction')?.acceptedAnswers).toEqual(['£30']);
  expect(learningTask(rate.entry, rate.sense, 'distinction')?.acceptedAnswers).toEqual(['an interest rate']);
  expect(amount.sense.antonyms).toEqual([]); expect(rate.sense.antonyms).toEqual([]);
});

test.each([
  ['discount', 'kaikki:59492e9275e49050df', undefined],
  ['discount', 'kaikki:519f99a3c0730f2f55', undefined],
  ['discount', 'kaikki:b9bb4401ce227f16a2', 'specialist'],
  ['discount', 'kaikki:d569f337e25f26b3d5', 'specialist'],
  ['survey', 'kaikki:dd4dc6c2d2bb1db148', 'historical'],
  ['survey', 'kaikki:23f8fed557877ac46d', 'specialist'],
  ['survey', 'kaikki:10ca01a3d7b23d1ab4', 'specialist'],
])('reading guidance for %s/%s cannot become an invented sentence gap', (term, id, priority) => {
  const { entry, sense } = selected(term!, id!);
  expect(isVocabularyReadingNote(entry.id, sense)).toBe(true);
  expect(learningTask(entry, sense, 'cloze')).toBeUndefined();
  expect(getVocabularyLearningPriority(entry.id, sense)).toBe(priority);
});

test('transactional-analysis guidance describes disregarded communication without teaching the imported feelings rule', () => {
  const verb = selected('discount', 'kaikki:b9bb4401ce227f16a2');
  const noun = selected('discount', 'kaikki:d569f337e25f26b3d5');
  expect(verb.sense.definition).toMatch(/disregard.*communication/);
  expect(noun.sense.definition).toMatch(/response.*disregards.*communication/);
  expect(noun.sense.antonyms).toEqual([]);
  expect(getVocabularyPronunciation(verb.entry, verb.sense)).toMatchObject({ required: true, recordings: [] });
  expect(getVocabularyPronunciation(verb.entry, verb.sense).binding).toBeUndefined();
  const personal = { ...verb.raw, definition: 'My own definition of discount.' };
  expect(supplementVocabularySense(verb.entry.id, personal, [], hasVocabularySenseEdits).definition).toBe(personal.definition);
});
