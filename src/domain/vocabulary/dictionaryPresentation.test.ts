import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { vocabularyPartOfSpeech, vocabularyPartOfSpeechLabel, vocabularySensePresentation } from "./dictionaryPresentation";
const sense = {
  id: "sense",
  pos: "noun",
  definition: "[[animal]]",
  example: "",
  usage: "usually",
};
test("dictionary labels become relations, incomplete usage and wiki artifacts do not become examples", () => {
  const original = { ...sense, example: "Meronym: stock animal" };
  expect(vocabularySensePresentation(original)).toMatchObject({
    definition: "animal",
    example: "",
    usage: "",
    relations: [{ label: "Meronym", values: ["stock animal"] }],
  });
  expect(original.example).toBe("Meronym: stock animal");
});
test("real examples remain and labeled usage relations have display-only cleanup", () => {
  expect(
    vocabularySensePresentation({
      ...sense,
      example: "The farmer raised livestock.",
      usage: "Synonyms: [[cattle|cattle]], stock",
    }),
  ).toMatchObject({
    example: "The farmer raised livestock.",
    usage: "",
    relations: [{ label: "Synonyms", values: ["cattle", "stock"] }],
  });
});

test.each([
  "Near-synonyms: see Thesaurus:adjunct",
  "See also [[Thesaurus:adjunct]]",
  "Thesaurus:adjunct",
  "For quotations using this term, see Citations:accounting.",
  "See also [[Citations:animal]]",
  "Citations:accounting",
])("dictionary cross-reference %s is not an example or a relation value", (example) => {
  const original = { ...sense, example };
  expect(vocabularySensePresentation(original)).toMatchObject({
    example: "",
    relations: [],
  });
  expect(original.example).toBe(example);
});

test("near-synonyms are shown as relations without dictionary navigation references", () => {
  expect(vocabularySensePresentation({
    ...sense,
    example: "Near-synonyms: [[addition]], extra; see also Thesaurus:adjunct",
    usage: "Synonyms: see Thesaurus:adjunct",
  })).toMatchObject({
    example: "",
    usage: "",
    relations: [{ label: "Near-synonyms", values: ["addition", "extra"] }],
  });
});

test.each([
  "See you tomorrow.",
  "The supplement contains an appendix: see page 12 for details.",
  "She wrote ‘Thesaurus:adjunct’ in her notes.",
])("a real sentence containing reference-like words remains: %s", (example) => {
  expect(vocabularySensePresentation({ ...sense, example }).example).toBe(example);
});

test('editorial selection metadata is not presented as an English usage rule', () => {
  const usage = 'Recommended learning meaning selected from the chapter topic; the original source meaning is unverified.';
  const original = { ...sense, usage, editorial: { source: 'Fieldbook group curriculum', license: 'CC-BY-4.0', attribution: 'Fieldbook editorial contributors' } };
  expect(vocabularySensePresentation(original).usage).toBe('');
  expect(original.usage).toBe(usage);
  expect(vocabularySensePresentation({ ...original, source: 'Personal note' }).usage).toBe(usage);
  expect(vocabularySensePresentation({ ...original, usage: 'Usually followed by an infinitive.' }).usage).toBe('Usually followed by an infinitive.');
});

test.each([
  ['noun', 'noun'], ['verb', 'verb'], ['adj', 'adjective'], ['adjective', 'adjective'], ['ADJ', 'adjective'],
  ['adv', 'adverb'], ['name', 'proper name'], ['prep', 'preposition'], ['conj', 'conjunction'],
  ['prep_phrase', 'prepositional phrase'], ['prep phrase', 'prepositional phrase'], ['prep-phrase', 'prepositional phrase'],
  ['det', 'determiner'], ['num', 'numeral'], ['pron', 'pronoun'], ['intj', 'interjection'],
  ['phrase', 'phrase'], ['symbol', 'symbol'], ['particle', 'particle'], ['contraction', 'contraction'],
  [' Noun ', 'noun'], ['word', ''], ['other', ''], ['unknown', ''], ['', ''], [undefined, ''],
])('one formatter labels word class %j as %j', (pos, label) => {
  expect(vocabularyPartOfSpeech(pos)).toBe(label);
});
test('every word class stored in the dictionary data has a learner-facing English label', () => {
  const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8')) as Record<string, string>;
  const classes = new Set<string>();
  for (const file of new Set(Object.values(index))) {
    for (const sense of JSON.parse(readFileSync(`public/dictionary/${file}`, 'utf8')).senses ?? []) classes.add(sense.pos);
  }
  expect([...classes].sort()).toEqual(expect.arrayContaining(['adj', 'prep_phrase', 'det', 'num', 'pron', 'intj']));
  for (const pos of classes) {
    const label = vocabularyPartOfSpeech(pos);
    expect(label, pos).toMatch(/^[a-z]+(?: [a-z]+)*$/);
    expect(label, pos).not.toMatch(/^(?:adj|adv|prep|conj|det|num|pron|intj|prep phrase)$/);
  }
}, 30_000);
test('word-class labels are sentence case for headings and fall back when the class is a placeholder', () => {
  expect(vocabularyPartOfSpeechLabel('prep_phrase')).toBe('Prepositional phrase');
  expect(vocabularyPartOfSpeechLabel('adj')).toBe('Adjective');
  expect(vocabularyPartOfSpeechLabel('other', 'Meaning')).toBe('Meaning');
  expect(vocabularyPartOfSpeechLabel(undefined)).toBe('');
});
