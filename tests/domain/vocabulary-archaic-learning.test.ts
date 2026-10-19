import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask, reviewedEntry } from '../../src/domain/vocabulary/content';
import { isVocabularyMeaningGroup, isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { freezeVocabularyPronunciation, getVocabularyPronunciation, isFrozenVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const entry = (term: string): VocabularyEntry => catalog.entries.find((row: VocabularyEntry) => row.term === term);
const raw = (term: string, id: string): VocabularySense => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses.find((sense: VocabularySense) => sense.id === id);

test.each([
 ['gravity', 'kaikki:ee237e3c51f2c76939', /attraction between bodies/],
 ['notorious', 'kaikki:c8a7c3593f6d6ef199', /Widely known for something bad/],
 ['subtle', 'kaikki:845b7bb857daee162a', /barely noticeable/],
] as const)('%s learns a lexical meaning and keeps its source directory out of practice', (term, id, meaning) => {
 const original = raw(term, id), heading = supplementVocabularySense(entry(term).id, original, [original], hasVocabularySenseEdits);
 expect(isVocabularyMeaningGroup(entry(term).id, heading)).toBe(true);
 expect(learningTask({ ...entry(term), senses: [heading] }, heading, 'definition')).toBeUndefined();
 const current = reviewedEntry(entry(term));
 expect(current.senses[0].definition).toMatch(meaning);
 expect(isVocabularyMeaningGroup(entry(term).id, current.senses[0])).toBe(false);
 expect(current.senses.some(sense => sense.id === original.id)).toBe(true);
});

test('a new noun default does not retarget a selected regional verb or overwrite a personal example', () => {
 const source = raw('gang', 'kaikki:d917116163521ce769'), current = reviewedEntry(entry('gang'));
 expect(current.senses[0].pos).toBe('noun');
 const regional = supplementVocabularySense(entry('gang').id, source, [source], hasVocabularySenseEdits);
 expect(regional.id).toBe(source.id);
 expect(regional.pos).toBe('verb');
 expect(isVocabularyReadingNote(entry('gang').id, regional)).toBe(true);
 expect(learningTask({ ...entry('gang'), senses: [regional] }, regional, 'cloze')).toBeUndefined();
 const personal = { ...source, definition: 'My regional verb note.', example: 'My own saved sentence.', source: 'Personal note' };
 expect(supplementVocabularySense(entry('gang').id, personal, [source], hasVocabularySenseEdits)).toEqual(personal);
 expect(reviewedEntry({ ...entry('gang'), senses: [personal] }).senses[0]).toEqual(personal);
});

test('the sophisticate noun default retains its final /kət/ reading without borrowing the verb recording', () => {
 const current = reviewedEntry(entry('sophisticate')), noun = current.senses[0];
 expect(noun.pos).toBe('noun');
 const reading = getVocabularyPronunciation(current, noun);
 expect(reading.required).toBe(true);
 expect(reading.group?.ipa.us).toBe('/səˈfɪstɪkət/');
 expect(reading.recordings.some(recording => recording.accent === 'uk')).toBe(true);
 expect(reading.recordings.some(recording => recording.accent === 'us')).toBe(false);
 const frozen = freezeVocabularyPronunciation(current, noun);
 expect(isFrozenVocabularyPronunciation(frozen, current, noun)).toBe(true);
 expect(isFrozenVocabularyPronunciation(frozen, current, { ...noun, pos: 'verb' })).toBe(false);
});

test('the retained sophisticate verb has its own /keɪt/ group and legacy history stays explicit', () => {
 const current = entry('sophisticate'), original = raw('sophisticate', 'kaikki:629b84e002f458f167');
 const verb = supplementVocabularySense(current.id, original, [original], hasVocabularySenseEdits);
 const reading = getVocabularyPronunciation(current, verb);
 expect(reading.group?.ipa.us).toBe('/səˈfɪstɪkeɪt/');
 expect(reading.recordings.some(recording => recording.accent === 'us')).toBe(true);
 expect(getVocabularyPronunciation(current, verb, 'legacy')).toMatchObject({ required: false, legacy: true });
});
