import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyDiagramPackId } from '../../src/features/vocabulary/diagramPacks';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['assert', 'declare', 'announce', 'maintain'];
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const raw = (term: string): VocabularySense[] => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses;
const entry = (term: string): VocabularyEntry => catalog.entries.find((e: VocabularyEntry) => e.term === term);
const records = ledger.records.filter(r => terms.includes(r.term));
const rows = corrections.filter(r => records.some(l => l.entryId === r.entryId && l.senseId === r.senseId));
const at = (term: string, i: number) => {
  const row = rows.find(r => r.entryId === entry(term).id && r.senseId === raw(term)[i].id);
  expect(row, `${term} meaning ${i}`).toBeDefined(); return row!;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('all 25 preserved records retain exact identities and source fingerprints without a fabricated announce heading meaning', () => {
  expect(records).toHaveLength(25); expect(rows).toHaveLength(25);
  for (const term of terms) for (const [i, sense] of raw(term).entries()) {
    expect(at(term, i).originalSense).toEqual(sense);
    expect(records.find(r => r.entryId === entry(term).id && r.senseId === sense.id)?.sourceHash).toBe(hash(sense));
  }
  expect(sources.filter(r => terms.includes(r.term))).toEqual([]);
  expect(records.filter(r => r.term === 'announce')).toHaveLength(4);
});

test('declare recommends the modern announcement identity while the obsolete explanation remains independent', () => {
  const selected = defaults.find(r => r.entryId === entry('declare').id)!;
  expect(selected.sense.id).toBe(raw('declare')[1].id);
  expect(selected.sense.definition).toBe(at('declare', 1).definition);
  expect(at('declare', 0).exampleKind).toBe('reading-note');
  expect(at('declare', 0).learningPriority).toBe('historical');
  expect(at('declare', 1).learningPriority).toBe('general');
});

test('a confident assertion does not independently prove affordability', () => {
  expect(at('assert', 0).example).toContain('not provided the cost figures');
  expect(at('assert', 0).distinctionTask?.answer).toContain('without independently proving');
});

test('exercising authority and defending a right stay distinct from stating existence or deciding legal validity', () => {
  expect(at('assert', 1).distinctionTask?.answer).toContain('exercise authority');
  expect(at('assert', 1).distinctions.join(' ')).toContain('separate from merely saying');
  expect(at('assert', 2).distinctions.join(' ')).toContain('does not independently settle');
});

test('assert oneself keeps the reflexive construction without equating assertiveness with aggression', () => {
  expect(at('assert', 3).originalSense.register).toBe('reflexive');
  expect(at('assert', 3).example).toContain('assert myself');
  expect(at('assert', 3).distinctions.join(' ')).toContain('does not require aggression');
});

test('Python assertions are enabled checks rather than value repair or an unconditional runtime guarantee', () => {
  const row = at('assert', 4);
  expect(row.distinctionTask?.prompt).toContain('with assertions enabled');
  expect(row.distinctionTask?.answer).toBe('raises AssertionError');
  expect(row.distinctions.join(' ')).toContain('omit assertion checks');
  expect(row.usage).toContain('depend on the language and execution settings');
  expect(row.originalSense.register).toBe(''); expect(row.learningPriority).toBe('specialist');
});

test('the active-low signal explicitly uses low rather than inventing a universal high-voltage rule', () => {
  const row = at('assert', 5); expect(row.example).toContain('active-low circuit');
  expect(row.distinctionTask?.answer).toBe('drive the reset signal low');
  expect(row.distinctions.join(' ')).toContain('does not universally mean');
  expect(row.usage).toContain('no particular voltage');
});

test('the source synonym template becomes a usable programming noun without changing its imported relation record', () => {
  const row = at('assert', 6); expect(row.originalSense.definition).toBe('Synonym of assertion.');
  expect(row.originalSense.pos).toBe('noun'); expect(row.definition).toContain('programming assertion');
  expect(row.example).toContain('an assert'); expect(row.distinctionTask?.answer).toBe('a programming assertion check');
  expect(row).not.toHaveProperty('referenceOnly');
});

test('customs declaration reports goods without establishing payment or universal exemption', () => {
  const row = at('declare', 2); expect(row.distinctionTask?.answer).toContain('report the goods');
  expect(row.distinctions.join(' ')).toContain('any duty has been paid');
  expect(row.usage).toContain('applicable rules');
});

test('card scoring is scoped to the stated game and a constituency declaring predicts an announcement rather than a new vote', () => {
  expect(at('declare', 3).example).toMatch(/^In this game/);
  expect(at('declare', 3).usage).toContain('depend on the game');
  expect(at('declare', 4).distinctionTask?.answer).toBe('announce its election result');
  expect(at('declare', 4).distinctions.join(' ')).toContain('without naming a winner');
});

test('the cricket correction identifies the batting captain, non-final innings, dead ball and irreversible notification under MCC2026', () => {
  const row = at('declare', 5); expect(row.originalSense.definition).toContain('bowling side bat');
  expect(row.definition).toContain('batting captain'); expect(row.example).toContain('first innings');
  expect(row.usage).toContain('2026'); expect(row.usage).toContain('excludes the match’s final innings');
  expect(row.usage).toContain('ball is dead'); expect(row.usage).toContain('opposing captain and umpires');
  expect(row.usage).toContain('cannot be changed');
  expect(row.distinctions.join(' ')).toContain('does not automatically concede');
});

test('a C function prototype can declare without a body while other declarations may also define', () => {
  const row = at('declare', 6); expect(row.example).toContain('int score(void);');
  expect(row.distinctionTask?.answer).toContain('without supplying its body');
  expect(row.usage).toContain('other contexts can also be definitions');
});

test('gaming declare on and religious declarations retain context without asserting a real war or verified spiritual outcome', () => {
  expect(at('declare', 7).example).toContain('In the strategy game');
  expect(at('declare', 7).usage).toContain('on before the target');
  const religious = at('declare', 8); expect(religious.exampleKind).toBe('reading-note');
  expect(religious.example).toContain('some evangelical');
  expect(religious.distinctions.join(' ')).toContain('does not independently verify');
  expect(religious.distinctions.join(' ')).toContain('does not define every form');
});

test('a judicial announcement is not silently labelled obsolete and pronouncement is separate from carrying out a penalty', () => {
  const row = at('announce', 1); expect(row.usage).toContain('not labelled obsolete');
  expect(row.learningPriority).toBe('specialist'); expect(row.distinctionTask?.answer).toBe('a planned judicial pronouncement');
  expect(row.distinctions.join(' ')).toContain('penalty has already been carried out');
});

test('the existing announcer children retain transitive commentary and an intransitive job construction', () => {
  expect(at('announce', 2).example).toContain('describing the play');
  expect(at('announce', 2).usage).toContain('event is the direct object');
  expect(at('announce', 3).example).toContain('used to announce on local radio');
  expect(at('announce', 3).usage).toContain('Intransitive');
  expect(at('announce', 2).usage).toContain('Chiefly US'); expect(at('announce', 3).usage).toContain('Chiefly US');
});

test('maintain separates keeping a condition, continuing a claim and routine equipment care that can include repairs', () => {
  expect(at('maintain', 0).distinctions.join(' ')).toContain('rather than a measured temperature record');
  expect(at('maintain', 1).distinctionTask?.answer).toBe('reports a continuing claim');
  expect(at('maintain', 2).distinctions.join(' ')).toContain('can include repairs');
  expect(at('maintain', 2).distinctions.join(' ')).toContain('not limited');
});

test('AAVE composure remains an unclassified reading use independent of the obsolete support meaning', () => {
  expect(at('maintain', 3).learningPriority).toBe('historical');
  const row = at('maintain', 4); expect(row.usage).toContain('AAVE slang');
  expect(row.usage).toContain('not labelled obsolete'); expect(row).not.toHaveProperty('learningPriority');
  expect(row.exampleKind).toBe('reading-note');
});

test('the four reading explanations remain out of public sentence gaps', () => {
  const notes = rows.filter(r => r.exampleKind === 'reading-note'); expect(notes).toHaveLength(4);
  for (const row of notes) {
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const term = records.find(r => r.senseId === row.senseId)!.term;
    expect(isVocabularyReadingNote(row.entryId, sense)).toBe(true);
    expect(learningTask({ ...entry(term), senses: [sense] }, sense, 'cloze')).toBeUndefined();
  }
});

test('21 natural headword examples support exact-sense cloze and their independent distinction answers', () => {
  const sentences = rows.filter(r => !r.exampleKind); expect(sentences).toHaveLength(21);
  for (const row of sentences) {
    const term = records.find(r => r.senseId === row.senseId)!.term;
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const word = { ...entry(term), senses: [sense] };
    expect(learningTask(word, sense, 'cloze')?.acceptedAnswers).toContain(term);
    expect(learningTask(word, sense, 'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);
  }
});

test('21 new diagrams have exact part-of-speech bindings, owned A/D/M packs and no inheritance after a personal definition edit', () => {
  const current = diagrams.filter(d => terms.includes(d.term)); expect(current).toHaveLength(21);
  for (const row of current) {
    expect(getVocabularyDiagramPackId(row.kind)).toBe(row.term === 'declare' ? 'd' : row.term === 'maintain' ? 'm' : 'a');
    const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
    const resolved = { entry: entry(row.term), sense, contentReviewed: false } as any;
    expect(getVocabularySenseDiagram(resolved)?.kind).toBe(row.kind);
    expect(getVocabularySenseDiagram({ ...resolved, sense: { ...sense, definition: 'My own definition.' } })).toBeUndefined();
  }
});
