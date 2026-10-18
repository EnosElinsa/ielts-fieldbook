import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyDiagramPackId } from '../../src/features/vocabulary/diagramPacks';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['discuss', 'dispute', 'debate', 'negotiate'];
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const raw = (term: string): VocabularySense[] => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses;
const entry = (term: string): VocabularyEntry => catalog.entries.find((e: VocabularyEntry) => e.term === term);
const records = ledger.records.filter(r => terms.includes(r.term));
const rows = corrections.filter(r => records.some(l => l.entryId === r.entryId && l.senseId === r.senseId));
const at = (term: string, i: number) => {
  const row = rows.find(r => r.entryId === entry(term).id && r.senseId === raw(term)[i].id);
  expect(row).toBeDefined(); return row!;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('all 28 preserved meanings retain their exact original identities and fields alongside one restored child', () => {
  expect(records).toHaveLength(29); expect(rows).toHaveLength(29);
  for (const term of terms) for (const sense of raw(term)) {
    const row = rows.find(r => r.entryId === entry(term).id && r.senseId === sense.id);
    expect(row?.originalSense).toEqual(sense);
    expect(records.find(r => r.entryId === entry(term).id && r.senseId === sense.id)?.sourceHash).toBe(hash(sense));
  }
});

test('the legal dispute is a genuine independent child of disagreement, not a replacement for the parent', () => {
  const restored = sources.filter(r => r.term === 'dispute'); expect(restored).toHaveLength(1);
  const child = restored[0]!; expect(child.parentSenseId).toBe(raw('dispute')[0].id);
  expect(child.parentSourceHash).toBe(hash(raw('dispute')[0]));
  expect(child.revision).toBe(93521186); expect(child.sense.definition).toMatch(/contract, lawsuit, treaty/);
  const row = rows.find(r => r.senseId === child.sense.id); expect(row?.dictionaryParentSenseId).toBe(raw('dispute')[0].id);
  expect(row?.distinctionTask?.answer).toContain('legal disagreement');
  expect(at('dispute', 0).definition).not.toContain('contract, lawsuit');
});

test('ordinary discuss teaches the direct topic object without turning overlapping debate into a forbidden synonym', () => {
  const row = at('discuss', 0); expect(row.distinctionTask?.answer).toContain('directly as its object');
  expect(row.distinctions.join(' ')).toContain('can overlap'); expect(row.usage).toContain('need not involve disagreement');
});

test('specialised legal discuss preserves the missing import label without declaring every debtor-first sequence mandatory', () => {
  const row = at('discuss', 4); expect(row.originalSense.register).toBe('transitive');
  expect(row.learningPriority).toBe('specialist'); expect(row.usage).toContain('Specialised legal use');
  expect(row.usage).toMatch(/not labelled obsolete/); expect(row.distinctions.join(' ')).toContain('not a universal legal requirement');
  expect(row.exampleKind).toBe('reading-note');
});

test('the four obsolete discuss meanings remain independent reading explanations', () => {
  for (const i of [1, 2, 3, 5]) { expect(at('discuss', i).learningPriority).toBe('historical'); expect(at('discuss', i).exampleKind).toBe('reading-note'); }
  expect(at('discuss', 2).definition).toContain('shatter'); expect(at('discuss', 3).definition).toContain('consume');
});

test('countable disagreement, uncountable controversy and intransitive arguing retain different constructions', () => {
  expect(at('dispute', 0).usage).toContain('Countable'); expect(at('dispute', 1).usage).toContain('Uncountable');
  expect(at('dispute', 1).learningPriority).toBe('general'); expect(at('dispute', 2).example).toContain('dispute with one another');
  expect(at('dispute', 2).distinctions.join(' ')).toContain('does not take a challenged claim as its direct object');
});

test('considering both sides, challenging validity and contesting control do not silently assert truth or a winner', () => {
  expect(at('dispute', 3).distinctionTask?.answer).toBe('examining opposing arguments');
  expect(at('dispute', 3)).not.toHaveProperty('learningPriority');
  expect(at('dispute', 4).distinctions.join(' ')).toContain('does not independently prove');
  expect(at('dispute', 5).distinctions.join(' ')).toContain('neither identifies the rightful owner');
});

test('private debate uses an unresolved whether choice while the public verb reports no agreed outcome', () => {
  expect(at('debate', 3).example).toBe('I sometimes debate whether to take the train or drive.');
  expect(at('debate', 3).distinctions.join(' ')).toContain('does not require an opponent');
  expect(at('debate', 0).distinctions.join(' ')).toContain('does not report a winner');
});

test('formal, informal and continuing debate do not universally require a ballot or establish consensus', () => {
  expect(at('debate', 4).distinctions.join(' ')).toContain('not every formal debate must end in a vote');
  expect(at('debate', 5).distinctions.join(' ')).toContain('need not involve appointed speakers');
  expect(at('debate', 6).distinctions.join(' ')).toContain('does not establish that a final answer');
  expect(at('debate', 7).learningPriority).toBe('specialist'); expect(at('debate', 7).usage).toContain('not labelled obsolete');
});

test('negotiating talks differ from an arranged contract and successful navigation does not remove a bend', () => {
  expect(at('negotiate', 0).example).toContain('no agreement has been reached');
  expect(at('negotiate', 1).distinctionTask?.answer).toBe('arranging the contract by agreement');
  expect(at('negotiate', 2).distinctionTask?.answer).toBe('successfully got past the bend');
  expect(at('negotiate', 2).distinctions.join(' ')).toContain('did not remove');
});

test('instrument negotiation is a scoped reading note with indorsement, delivery and limits on rights', () => {
  const row = at('negotiate', 3); expect(row.exampleKind).toBe('reading-note');
  expect(row.example).toContain('US UCC Article3'); expect(row.example).toContain('indorsement and delivery');
  expect(row.example).toContain('bearer'); expect(row.example).toContain('Not every transfer is a negotiation');
  expect(row.distinctions.join(' ')).toContain('does not promise'); expect(row.usage).toContain('not a universal rule');
  expect(row.originalSense.definition).toContain('all the rights of the original holder');
});

test('all thirteen reading explanations stay out of public sentence gaps', () => {
  const notes = rows.filter(r => r.exampleKind === 'reading-note'); expect(notes).toHaveLength(13);
  for (const row of notes) {
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    expect(isVocabularyReadingNote(row.entryId, sense)).toBe(true);
    expect(learningTask({ ...entry(records.find(r => r.senseId === row.senseId)!.term), senses: [sense] }, sense, 'cloze')).toBeUndefined();
  }
});

test('sixteen contextual examples support exact-root sentence gaps and independent contrast answers', () => {
  const sentences = rows.filter(r => !r.exampleKind); expect(sentences).toHaveLength(16);
  for (const row of sentences) {
    const term = records.find(r => r.senseId === row.senseId)!.term;
    const sense = supplementVocabularySense(row.entryId, row.originalSense as VocabularySense, [], hasVocabularySenseEdits);
    const word = { ...entry(term), senses: [sense] };
    expect(learningTask(word, sense, 'cloze')?.acceptedAnswers).toContain(term);
    expect(learningTask(word, sense, 'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);
  }
});

test('new illustrations are confined to their D or N packs and personal edits cannot acquire a public diagram', () => {
  const current = diagrams.filter(d => terms.includes(d.term)); expect(current).toHaveLength(16);
  for (const row of current) {
    expect(getVocabularyDiagramPackId(row.kind)).toBe(row.term === 'negotiate' ? 'n' : 'd');
    const sense = { id: row.senseId, definition: row.definition, pos: row.pos, example: '' };
    const resolved = { entry: entry(row.term), sense, contentReviewed: false } as any;
    expect(getVocabularySenseDiagram(resolved)?.kind).toBe(row.kind);
    expect(getVocabularySenseDiagram({ ...resolved, sense: { ...sense, definition: 'My own meaning.' } })).toBeUndefined();
  }
});
