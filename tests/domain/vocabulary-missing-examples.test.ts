import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { vocabularySensePresentation } from '../../src/domain/vocabulary/dictionaryPresentation';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import type { ReadinessSupplement } from '../../src/domain/vocabulary/runtimeData';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const baseline = JSON.parse(readFileSync('src/domain/vocabulary/resourceMissingExamplesBaseline.json', 'utf8'));
const identities = new Set(baseline.removeCorrections.map((row: { entryId: string; senseId: string }) => JSON.stringify([row.entryId, row.senseId])));
const corrections = JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json', 'utf8')) as ReadinessSupplement[];
const rows = corrections.filter(row => identities.has(JSON.stringify([row.entryId, row.senseId])));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8')) as { entries: VocabularyEntry[] };

test('the missing-example batch gives all 77 exact meanings a visible sentence and a usable sentence gap', () => {
  expect(rows).toHaveLength(77);
  for (const row of rows) {
    const original = row.originalSense!;
    const supplemented = supplementVocabularySense(row.entryId, original, [original], hasVocabularySenseEdits);
    const entry = catalog.entries.find(entry => entry.id === row.entryId)!;
    expect(supplemented, entry.term).toEqual({ ...original, example: row.example,
      editorial: { source: 'Fieldbook core content review', license: 'CC-BY-4.0', attribution: 'Fieldbook editorial contributors' },
    });
    expect(vocabularySensePresentation(supplemented).example, entry.term).toBe(row.example);
    expect(learningTask({ ...entry, senses: [supplemented] }, supplemented, 'cloze'), entry.term).toBeDefined();
  }
});

test('new example supplements preserve saved personal examples and deliberate clears', () => {
  for (const row of rows) {
    const original = row.originalSense!;
    for (const example of ['My own saved example.', '']) {
      for (const source of [original.source, 'Personal note']) {
        const personal: VocabularySense = { ...original, example, source };
        expect(supplementVocabularySense(row.entryId, personal, [original], hasVocabularySenseEdits)).toEqual(personal);
      }
    }
  }
});

test('an example supplement never crosses an exact definition, example or part-of-speech boundary', () => {
  for (const row of rows) {
    const original = row.originalSense!;
    for (const sibling of [
      { ...original, definition: 'A different public meaning with the same source identifier.' },
      { ...original, example: 'Another course has already supplied its own public example.' },
      { ...original, pos: original.pos === 'noun' ? 'verb' : 'noun' },
    ]) {
      expect(supplementVocabularySense(row.entryId, sibling, [sibling], () => false)).toEqual(sibling);
    }
  }
});
