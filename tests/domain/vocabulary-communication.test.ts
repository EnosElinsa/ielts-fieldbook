import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import forms from '../../src/domain/vocabulary/sentenceGapForms.json';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyDiagramPackId } from '../../src/features/vocabulary/diagramPacks';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['communicate', 'express', 'mention', 'report'];
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const raw = (term: string): VocabularySense[] => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses;
const entry = (term: string): VocabularyEntry => catalog.entries.find((e: VocabularyEntry) => e.term === term);
const records = ledger.records.filter(r => terms.includes(r.term));
const rows = corrections.filter(r => records.some(l => l.entryId === r.entryId && l.senseId === r.senseId));
const at = (term: string, i: number) => {
  const id = raw(term)[i]?.id ?? sources.filter(r => r.term === term)[i - raw(term).length]?.sense.id;
  const row = rows.find(r => r.entryId === entry(term).id && r.senseId === id);
  expect(row, `${term} meaning ${i}`).toBeDefined(); return row!;
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('all 42 preserved meanings keep their source identities and nine missing children keep exact parents', () => {
  expect(records).toHaveLength(51); expect(rows).toHaveLength(51);
  for (const term of terms) for (const [i, sense] of raw(term).entries()) {
    expect(at(term, i).originalSense).toEqual(sense);
    expect(records.find(r => r.entryId === entry(term).id && r.senseId === sense.id)?.sourceHash).toBe(hash(sense));
  }
  const restored = sources.filter(r => terms.includes(r.term)); expect(restored).toHaveLength(9);
  for (const s of restored) {
    const parent = raw(s.term).find(r => r.id === s.parentSenseId)!;
    expect(s.parentSourceHash).toBe(hash(parent));
    expect(s.revision).toBe(s.term === 'communicate' ? 92685713 : 93476692);
    expect(rows.find(r => r.senseId === s.sense.id)?.dictionaryParentSenseId).toBe(parent.id);
  }
});

test('communicate begins with the restored information meaning without spreading an obsolete child label to its parent', () => {
  expect(defaults.find(r => r.entryId === entry('communicate').id)?.sense.id).toBe(at('communicate', 3).senseId);
  expect(at('communicate', 1).usage).toContain('only the share-or-partake child');
  expect(at('communicate', 1).learningPriority).toBeUndefined();
  expect(at('communicate', 1)).not.toHaveProperty('referenceOnly');
  expect(at('communicate', 6).learningPriority).toBe('historical');
});

test('communicate distinguishes infectious transmission, receiving Communion and administering it', () => {
  expect(at('communicate', 5).usage).toContain('medical');
  expect(at('communicate', 5).distinctions.join(' ')).toContain('not every disease');
  expect(at('communicate', 7).usage).toContain('Intransitive');
  expect(at('communicate', 8).usage).toContain('Transitive');
  expect(at('communicate', 7).definition).toContain('receive');
  expect(at('communicate', 8).definition).toContain('administer');
});

test('nonverbal exchange and physical openings have different diagrams', () => {
  expect(at('communicate', 9).example).toContain('hand signals');
  expect(at('communicate', 10).example).toContain('internal doorway');
  expect(at('communicate', 10).originalSense.definition).toBe('To be connected by means of an opening or channel .');
  expect(at('communicate', 10).definition).not.toContain('channel .');
});

test('express service allows selected stops and explicit permission need not be written', () => {
  expect(at('express', 0).distinctions.join(' ')).toContain('selected stations');
  expect(at('express', 1).example).toContain('said yes aloud');
  expect(at('express', 1).distinctionTask?.answer).toContain('explicit');
  expect(at('express', 1).distinctions.join(' ')).toContain('not necessarily written');
  expect(at('express', 3).distinctions.join(' ')).toContain('does not guarantee');
  expect(at('express', 5).distinctions.join(' ')).toContain('does not establish delivery');
});

test('express preserves adjective and adverb identities and narrowly scoped regional transport', () => {
  expect(at('express', 0).originalSense.pos).toBe('adj');
  expect(at('express', 11).originalSense.pos).toBe('adv');
  expect(at('express', 18).usage).toContain('Philippines');
  expect(at('express', 18).usage).toContain('Metro Manila');
  expect(at('express', 18).distinctions.join(' ')).toContain('not every jeepney');
  expect(at('express', 6).definition).toContain('high velocity');
  expect(at('express', 8).learningPriority).toBeUndefined();
});

test('express separates protein translation, DNA transcription and the broader functional RNA meaning', () => {
  expect(at('express', 14).example).toContain('introduced messenger RNA');
  expect(at('express', 14).distinctionTask?.answer).toContain('translation');
  expect(at('express', 15).example).toContain('translation is blocked');
  expect(at('express', 15).distinctionTask?.answer).toContain('transcription');
  expect(at('express', 15).usage).toContain('functional non-coding RNA');
  expect(at('express', 15).distinctions.join(' ')).toContain('not translation of DNA');
  expect(at('express', 13).usage).toContain('milk');
  expect(defaults.find(r => r.entryId === entry('express').id)?.sense.id).toBe(at('express', 12).senseId);
});

test('social mentions use an exact-bound plural answer and a personal replacement cannot inherit it', () => {
  const row = at('mention', 1), sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
  const word = { ...entry('mention'), senses: [sense] };
  expect(learningTask(word, sense, 'cloze')?.acceptedAnswers).toEqual(['mentions']);
  expect(forms.find(r => r.senseId === row.senseId)?.example).toBe(row.example);
  expect(learningTask(word, { ...sense, example: 'I mention the study.' }, 'cloze')?.acceptedAnswers).not.toContain('mentions');
  expect(at('mention', 3).example).toContain("word 'apple'");
  expect(at('mention', 3).distinctionTask?.answer).toContain('expression');
});

test('report separates relating information from verifying it and reporting a person from establishing guilt', () => {
  expect(at('report', 0).distinctions.join(' ')).toContain('does not independently verify');
  expect(at('report', 1).example).toContain('without checking');
  expect(at('report', 4).distinctions.join(' ')).toContain('does not establish guilt');
  expect(at('report', 3).example).toContain('police');
});

test('report distinguishes attending, journalism, accountability, committee procedure and a ship returning', () => {
  expect(at('report', 5).example).toContain('reception');
  expect(at('report', 6).example).toContain('report on');
  expect(at('report', 7).example).toContain('report to');
  expect(at('report', 8).usage).toContain('dated');
  expect(at('report', 8).distinctions.join(' ')).toContain('does not enact');
  expect(at('report', 12).example).toContain('re-port');
  expect(at('report', 12).distinctions.join(' ')).toContain('crew');
});

test('report sound and subordinate nouns remain separate from a written account and reputation', () => {
  expect(at('report', 15).distinctionTask?.answer).toContain('sound');
  expect(at('report', 16).distinctionTask?.answer).toContain('employee');
  expect(at('report', 14).learningPriority).toBeUndefined();
  expect(defaults.find(r => r.entryId === entry('report').id)?.sense.id).toBe(at('report', 13).senseId);
});

test('23 reading explanations cannot become public sentence gaps', () => {
  const notes = rows.filter(r => r.exampleKind === 'reading-note'); expect(notes).toHaveLength(23);
  for (const row of notes) {
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const term = records.find(r => r.senseId === row.senseId)!.term;
    expect(isVocabularyReadingNote(row.entryId, sense)).toBe(true);
    expect(learningTask({ ...entry(term), senses: [sense] }, sense, 'cloze')).toBeUndefined();
  }
});

test('28 contextual examples provide exact-meaning cloze and independent distinction tasks', () => {
  const sentences = rows.filter(r => !r.exampleKind); expect(sentences).toHaveLength(28);
  for (const row of sentences) {
    const term = records.find(r => r.senseId === row.senseId)!.term;
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const word = { ...entry(term), senses: [sense] };
    expect(learningTask(word, sense, 'cloze')?.acceptedAnswers).toContain(term === 'mention' && row.senseId === raw(term)[1].id ? 'mentions' : term);
    expect(learningTask(word, sense, 'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);
    expect(row.distinctionTask!.prompt).toContain('_____');
  }
});

test('28 new diagrams bind exact meanings to C/E/M/R and stop matching a personal definition', () => {
  const current = diagrams.filter(d => terms.includes(d.term)); expect(current).toHaveLength(28);
  for (const row of current) {
    expect(getVocabularyDiagramPackId(row.kind)).toBe(row.term[0]);
    const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
    const resolved = { entry: entry(row.term), sense, contentReviewed: false } as any;
    expect(getVocabularySenseDiagram(resolved)?.kind).toBe(row.kind);
    expect(getVocabularySenseDiagram({ ...resolved, sense: { ...sense, definition: 'My own definition.' } })).toBeUndefined();
  }
});
