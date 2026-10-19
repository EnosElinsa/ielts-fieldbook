import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { vocabularySensePresentation } from '../../src/domain/vocabulary/dictionaryPresentation';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const terms = ['Xerox', 'accountants', 'barrel', 'bead', 'broom', 'cannon', 'clause', 'cosmetics', 'criteria', 'detergent', 'family room', 'glue', 'incidentally', 'livestock', 'living room', 'logogram', 'masquerade', 'missionary', 'motor', 'packing list', 'pan', 'paraphrase', 'print off', 'propaganda', 'quantitative', 'scissors', 'spectrum', 'stale', 'synonym', 'textile'];
function selected(term: string) {
  const entry = catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
  const raw = JSON.parse(readFileSync('public/dictionary/' + index[term.toLowerCase()], 'utf8')).senses as VocabularySense[];
  return { entry, raw };
}

test.each(terms)('the previously missing displayed example for %s is replaced with exact learning text and useful notes', term => {
  const { entry, raw } = selected(term);
  const previous = VOCABULARY_CATALOG.entries;
  VOCABULARY_CATALOG.entries = catalog.entries;
  try {
    const resolved = resolveVocabularyLearningContext(entry), sense = resolved.sense!;
    expect(vocabularySensePresentation(sense).example.length).toBeGreaterThan(15);
    expect(sense.collocations?.length).toBeGreaterThan(0);
    expect(sense.distinctions?.length).toBeGreaterThan(0);
    expect(sense.example).not.toMatch(/^(?:Near-synonyms?|Meronyms?|Holonyms?|For quotations)/i);
    const original = raw.find(row => row.id === sense.id)!;
    expect(original).toBeDefined();
    expect(supplementVocabularySense(entry.id, { ...original, example: 'My own saved example.', source: 'Personal note' }, raw, hasVocabularySenseEdits).example).toBe('My own saved example.');
    if (!isVocabularyReadingNote(entry.id, sense)) expect(learningTask(resolved.entry, sense, 'cloze')).toBeDefined();
  } finally { VOCABULARY_CATALOG.entries = previous; }
});

test('pan defaults to the cooking noun while the mythological name stays separately accessible', () => {
  const { entry, raw } = selected('pan'), previous = VOCABULARY_CATALOG.entries;
  VOCABULARY_CATALOG.entries = catalog.entries;
  try {
    const resolved = resolveVocabularyLearningContext(entry);
    expect(resolved.sense).toMatchObject({ id: 'kaikki:06cf3f78c1c816bb8e', pos: 'noun' });
    const deity = supplementVocabularySense(entry.id, raw[0], raw, hasVocabularySenseEdits);
    expect(deity.id).toBe('kaikki:62e1772a61c6368e1d');
    expect(isVocabularyReadingNote(entry.id, deity)).toBe(true);
    expect(learningTask({ ...entry, senses: [deity] }, deity, 'cloze')).toBeUndefined();
  } finally { VOCABULARY_CATALOG.entries = previous; }
});

test('packing list has its logistics meaning, criteria keeps plural agreement and stale does not assert food safety', () => {
  const current = (term: string) => { const { entry, raw } = selected(term); return supplementVocabularySense(entry.id, raw[0], raw, hasVocabularySenseEdits); };
  expect(current('packing list').definition).toMatch(/contents.*package/i);
  expect(current('criteria').usage).toMatch(/criteria are/);
  expect(current('stale').distinctions?.join(' ')).toMatch(/not.*(?:safe|unsafe)|does not.*(?:safe|unsafe)/i);
});
