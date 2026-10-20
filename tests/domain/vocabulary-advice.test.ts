import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyDiagramPackId } from '../../src/features/vocabulary/diagramPacks';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['propose', 'recommend', 'advise', 'conclude'];
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const raw = (term: string): VocabularySense[] => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses;
const entry = (term: string): VocabularyEntry => catalog.entries.find((e: VocabularyEntry) => e.term === term);
const records = ledger.records.filter(r => terms.includes(r.term));
// This batch's original source reviews remain distinct from later scoped teaching variants.
const rows = corrections.filter(r => !('variantId' in r) && records.some(l => l.entryId === r.entryId && l.senseId === r.senseId));
const at = (term: string, i: number) => {
  const row = rows.find(r => r.entryId === entry(term).id && r.senseId === raw(term)[i].id);
  expect(row, `${term} meaning ${i}`).toBeDefined(); return row!;
};

test('the proposal, recommendation, advice and conclusion batch preserves all 29 independent source meanings', () => {
  expect(records).toHaveLength(29); expect(rows).toHaveLength(29);
  for (const term of terms) for (const [i, source] of raw(term).entries()) {
    expect(at(term, i).originalSense).toEqual(source);
    expect(records.find(r => r.entryId === entry(term).id && r.senseId === source.id)?.sourceHash)
      .toBe(createHash('sha256').update(JSON.stringify(source)).digest('hex'));
  }
  for (const [term, i] of [['propose', 0], ['recommend', 0], ['advise', 0], ['conclude', 3]] as const)
    expect(defaults.find(r => r.entryId === entry(term).id)?.sense.id).toBe(raw(term)[i].id);
});

test('proposing an action, proposing marriage and intending to act retain different complements and open outcomes', () => {
  expect(at('propose', 0).example).toContain('propose holding');
  expect(at('propose', 1).example).toContain('propose to');
  expect(at('propose', 1).distinctions.join(' ')).toContain('does not establish acceptance');
  expect(at('propose', 2).example).toContain('propose to examine');
  expect(at('propose', 2).distinctionTask?.answer).toContain('intend');
});

test('recommend distinguishes an endorsed choice, an attractive feature and recommended action without promising success', () => {
  expect(at('recommend', 0).distinctions.join(' ')).toContain('does not guarantee');
  expect(at('recommend', 1).example).toContain('recommend it');
  expect(at('recommend', 1).distinctionTask?.answer).toContain('attractive');
  expect(at('recommend', 2).example).toContain('recommend checking');
  expect(at('recommend', 2).distinctions.join(' ')).toContain('not a command');
  expect(at('recommend', 4).learningPriority).toBeUndefined();
});

test('advise separates advice to a person, advice about an action and formal notification', () => {
  expect(at('advise', 0).example).toContain('advise new students to');
  expect(at('advise', 1).example).toContain('advise checking');
  expect(at('advise', 2).example).toContain('advise passengers of');
  expect(at('advise', 2).distinctionTask?.answer).toContain('notify');
  expect(at('advise', 2).distinctions.join(' ')).toContain('does not recommend');
});

test('Scots legal advise is scoped reading guidance and requested sovereign information is not a universal ban on inform', () => {
  expect(at('advise', 6).usage).toContain('Scots law');
  expect(at('advise', 6).learningPriority).toBe('specialist');
  expect(at('advise', 6).exampleKind).toBe('reading-note');
  expect(at('advise', 6).distinctions.join(' ')).toContain('not ordinary advice');
  expect(at('advise', 7).example).toContain('monarch’s request');
  expect(at('advise', 7).distinctions.join(' ')).toContain('not a general rule');
});

test('the misspelled noun advise remains a reading reference without replacing the valid verb or allowing public practice', () => {
  const row = at('advise', 8);
  expect(row).toHaveProperty('referenceOnly', true);
  const selected = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
  for (const mode of ['cloze', 'distinction', 'dictation', 'definition'] as const)
    expect(learningTask({ ...entry('advise'), senses: [selected] }, selected, mode)).toBeUndefined();
  expect(at('advise', 0)).not.toHaveProperty('referenceOnly');
});

test('conclude separates an event ending, ending it, reaching agreement and reasoning without a universal causal claim', () => {
  expect(at('conclude', 0).usage).toContain('Intransitive');
  expect(at('conclude', 1).usage).toContain('Transitive');
  expect(at('conclude', 2).distinctions.join(' ')).toContain('not ending');
  expect(at('conclude', 3).distinctions.join(' ')).toContain('does not guarantee');
  expect(at('conclude', 5).learningPriority).toBe('specialist');
  expect(at('conclude', 5).usage).not.toContain('obsolete');
  expect(at('conclude', 8).example).toContain('All squares are rectangles');
  expect(at('conclude', 8).distinctions.join(' ')).toContain('not a causal relation');
});

test('14 explicitly typed reading explanations are excluded from public sentence gaps', () => {
  const notes = rows.filter(r => r.exampleKind === 'reading-note'); expect(notes).toHaveLength(14);
  for (const row of notes) {
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const term = records.find(r => r.senseId === row.senseId)!.term;
    expect(isVocabularyReadingNote(row.entryId, sense)).toBe(true);
    expect(learningTask({ ...entry(term), senses: [sense] }, sense, 'cloze')).toBeUndefined();
  }
});

test('15 current contextual examples provide exact-meaning gaps and distinction questions', () => {
  const sentences = rows.filter(r => !r.exampleKind); expect(sentences).toHaveLength(15);
  for (const row of sentences) {
    const term = records.find(r => r.senseId === row.senseId)!.term;
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const word = { ...entry(term), senses: [sense] };
    expect(learningTask(word, sense, 'cloze')?.acceptedAnswers).toContain(term);
    expect(learningTask(word, sense, 'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);
  }
});

test('15 new diagrams use A/C/P/R packs and require the exact public meaning', () => {
  const current = diagrams.filter(d => terms.includes(d.term)); expect(current).toHaveLength(15);
  for (const row of current) {
    expect(getVocabularyDiagramPackId(row.kind)).toBe(row.term[0]);
    const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
    const resolved = { entry: entry(row.term), sense, contentReviewed: false } as any;
    expect(getVocabularySenseDiagram(resolved)?.kind).toBe(row.kind);
    expect(getVocabularySenseDiagram({ ...resolved, sense: { ...sense, definition: 'My own definition.' } })).toBeUndefined();
  }
});
