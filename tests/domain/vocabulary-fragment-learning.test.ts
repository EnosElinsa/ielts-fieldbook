import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { vocabularyCurriculumBaselines } from '../../src/domain/vocabulary/curriculum';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { isVocabularyMeaningGroup, isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string): VocabularyEntry => catalog.entries.find((row: VocabularyEntry) => row.term === term);
const raw = (term: string, id: string): VocabularySense => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses.find((sense: VocabularySense) => sense.id === id);

test.each([
  ['academic', 'adj', /university/], ['allowance', 'noun', /amount of money/], ['crush', 'verb', /press or squeeze/],
  ['despair', 'verb', /lose or give up hope/], ['deteriorate', 'verb', /become worse/], ['digest', 'verb', /break down food/],
  ['digital', 'adj', /computers/], ['disposal', 'noun', /getting rid/], ['equation', 'noun', /mathematical statement/],
  ['evolve', 'verb', /change or develop/], ['gender', 'noun', /identification/], ['kin', 'noun', /relatives/],
  ['liner', 'noun', /passenger ship/], ['litter', 'noun', /Waste or rubbish/], ['loom', 'noun', /interwoven/],
  ['regular', 'adj', /intervals/], ['scheme', 'noun', /plan or programme/], ['shutter', 'noun', /window/],
  ['strand', 'noun', /thread-like substance/], ['subsistence', 'noun', /needed to stay alive/], ['wreath', 'noun', /circular decoration/],
  ['descend', 'verb', /higher place.*lower one/], ['turn', 'verb', /direction.*travelling/], ['decade', 'noun', /ten years/],
] as const)('%s opens on a checked lexical learning meaning', (term, pos, definition) => {
  const selected = reviewedEntry(entry(term)).senses[0];
  expect(selected.pos).toBe(pos);
  expect(selected.definition).toMatch(new RegExp(definition.source, 'i'));
  expect(isVocabularyMeaningGroup(entry(term).id, selected)).toBe(false);
  expect(isVocabularyReadingNote(entry(term).id, selected)).toBe(false);
});

test.each([
  ['descend', 'kaikki:8e9b16dc32f129d2f5'], ['turn', 'kaikki:90f62e772e345d9c27'],
] as const)('%s keeps its source heading as a group and does not grade it as a meaning', (term, id) => {
  const source = raw(term, id), heading = supplementVocabularySense(entry(term).id, source, [source], hasVocabularySenseEdits);
  expect(isVocabularyMeaningGroup(entry(term).id, heading)).toBe(true);
  expect(learningTask({ ...entry(term), senses: [heading] }, heading, 'definition')).toBeUndefined();
  expect(learningTask({ ...entry(term), senses: [heading] }, heading, 'cloze')).toBeUndefined();
  expect(reviewedEntry(entry(term)).senses.some(sense => sense.id === id)).toBe(true);
});

test('shoot illustrates launching a projectile instead of substituting the weapon as its object', () => {
  // Locate this preserved broad source sense independently of its import order.
  const dictionary: { senses: VocabularySense[] } = JSON.parse(readFileSync('public/dictionary/' + index.shoot, 'utf8'));
  const original = dictionary.senses.find(sense => sense.definition.startsWith('To launch (forcefully project)'))!;
  const current = supplementVocabularySense(entry('shoot').id, original, [original], hasVocabularySenseEdits);
  expect(current.example).toBe('The archer shot an arrow at the target.');
  expect(current.distinctions?.join(' ')).toMatch(/projectile.*weapon/);
});

test('the adverb example contains the sentence whose grammatical structure it explains', () => {
  const current = reviewedEntry(entry('adverb')).senses[0];
  expect(current.example).toBe('In "She walks slowly", slowly is an adverb modifying walks.');
});

test('the numerical and musical descended meanings do not confuse order, pitch and loudness', () => {
  const sources = JSON.parse(readFileSync('src/domain/vocabulary/dictionarySenseSources.json', 'utf8'));
  const numerical = sources.find((row: { term: string; sourceGloss: string }) => row.term === 'descend' && row.sourceGloss.includes('{{lb|en|mathematics}}'));
  const musical = sources.find((row: { term: string; sourceGloss: string }) => row.term === 'descend' && row.sourceGloss.includes('{{lb|en|music}}'));
  const first = supplementVocabularySense(entry('descend').id, numerical.sense, [numerical.sense], hasVocabularySenseEdits);
  const second = supplementVocabularySense(entry('descend').id, musical.sense, [musical.sense], hasVocabularySenseEdits);
  expect(first.example).toBe('The sequence descends from 9 to 6 to 3.');
  expect(second.distinctions?.join(' ')).toMatch(/pitch.*quieter in volume/);
});

test('an existing religious reading and a personal note survive the new regular learning default', () => {
  const original = raw('regular', 'kaikki:434aabde00aea00cf7');
  const selected = supplementVocabularySense(entry('regular').id, original, [original], hasVocabularySenseEdits);
  expect(selected.id).toBe(original.id);
  expect(selected.definition).toMatch(/religious rule/);
  expect(selected.usage).toMatch(/Secular clergy does not mean/);
  const personal = { ...original, source: 'Personal note', definition: 'My saved religious meaning.', example: 'My own saved example.' };
  expect(supplementVocabularySense(entry('regular').id, personal, [original], hasVocabularySenseEdits)).toEqual(personal);
  expect(reviewedEntry({ ...entry('regular'), senses: [personal] }).senses[0]).toEqual(personal);
});

test('the two new direction/duration questions keep their exact selected meaning', () => {
  for (const [term, answer] of [['descend', 'descend'], ['decade', 'decade']] as const) {
    const current = reviewedEntry(entry(term)), sense = current.senses[0];
    const task = learningTask(current, sense, 'distinction');
    expect(task?.acceptedAnswers).toEqual([answer]);
    expect(sense.distinctionTask?.answer).toBe(answer);
  }
});

test('technology group turn selects rotation as a lexical child and retains the previous topic baseline', () => {
  const original = { ...VOCABULARY_CATALOG };
  Object.assign(VOCABULARY_CATALOG, catalog);
  try {
    const request = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-06-group-02' };
    const current = resolveVocabularyLearningContext(entry('turn'), request);
    expect(current.sense?.definition).toBe('To rotate about an axis through oneself or itself.');
    expect(isVocabularyMeaningGroup(entry('turn').id, current.sense!)).toBe(false);
    const queue = buildUnitPracticeQueue({ vocabulary: [entry('turn')] }, request.bookId, request.unitId, 'dictation');
    expect(queue.cards.find(card => card.entryId === entry('turn').id)?.senseId).toBe(current.sense?.id);
    const baselines = vocabularyCurriculumBaselines(entry('turn').id, 'kaikki:90f62e772e345d9c27');
    expect(baselines.some(sense => sense.example === 'The wheel turns as the motor runs.')).toBe(true);
    const personal = { ...baselines.find(sense => sense.example === 'The wheel turns as the motor runs.')!, source: 'Personal note', example: 'My own example of rotation.' };
    expect(resolveVocabularyLearningContext({ ...entry('turn'), senses: [personal] }, request).sense).toEqual(personal);
  } finally { Object.assign(VOCABULARY_CATALOG, original); }
});
