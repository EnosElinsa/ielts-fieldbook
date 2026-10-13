import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const original = structuredClone(VOCABULARY_CATALOG);
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const entry = (term: string) => structuredClone(catalog.entries.find((e: VocabularyEntry) => e.term === term)) as VocabularyEntry;
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(catalog)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(original)));

test('every released membership has a complete explicit learning curriculum without pretending source confirmation', () => {
  for (const m of catalog.memberships) {
    const e = catalog.entries.find((row: VocabularyEntry) => row.id === m.entryId);
    const resolved = resolveVocabularyLearningContext(e, m);
    expect(resolved.curriculum, `${m.bookId}/${m.unitId}/${e.term}`).toBeDefined();
    expect(resolved.curriculum?.title).toBeTruthy();
    expect(resolved.curriculum?.basis).toMatch(/^(theme|common|multiple|source)$/);
    expect(resolved.sense?.definition.trim()).toBeTruthy();
    expect(resolved.sense?.example.trim()).toBeTruthy();
  }
});

test('livestock uses an actual example and reviewed farm-animal combinations in the food theme', () => {
  const result = resolveVocabularyLearningContext(entry('livestock'), {bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  expect(result.sense?.example).not.toMatch(/^Meronym:/);
  expect(result.sense?.example).toMatch(/[.!?]$/);
  expect(result.sense?.collocations).toContain('raise livestock');
  expect(result.curriculum?.basis).toBe('theme');
});

test('a multiple-meaning wordbook exposes distinct modern meanings with separate identities', () => {
  const result = resolveVocabularyLearningContext(entry('book'), {bookId:'ielts-listening-essentials',unitId:'ielts-listening-essentials-chapter-04-group-01'});
  expect(result.curriculum?.basis).toBe('multiple');
  expect(result.curriculum?.senses.length).toBeGreaterThan(1);
  expect(result.curriculum?.senses.some(s=>s.pos==='verb' && /reserv/i.test(s.definition))).toBe(true);
  const ids = result.curriculum!.senses.map(s=>s.id);
  expect(new Set(ids).size).toBe(ids.length);
  const verb = result.curriculum!.senses.find(s=>s.pos==='verb')!;
  const selected = resolveVocabularyLearningContext(entry('book'), {bookId:'ielts-listening-essentials',unitId:'ielts-listening-essentials-chapter-04-group-01',senseId:verb.id});
  expect(selected.sense?.id).toBe(verb.id);
});

test('unknown group and learner edits cannot inherit a public curriculum confirmation', () => {
  expect(resolveVocabularyLearningContext(entry('livestock'), {bookId:'unknown',unitId:'unknown'}).curriculum).toBeUndefined();
  const raw=entry('livestock');raw.senses[0].definition='My farm vocabulary note.';
  const before=structuredClone(raw);
  const resolved=resolveVocabularyLearningContext(raw,{bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  expect(resolved.sense?.definition).toBe(raw.senses[0].definition);
  expect(resolved.reviewed).toBe(false);
  expect(raw).toEqual(before);
});

test('source transcript selections use separate meanings and freeze verified provenance without migrating history', () => {
  const raw=entry('Drone');
  const m=catalog.memberships.find((row:any)=>row.entryId===raw.id&&row.bookId==='ielts-listening-practice-20');
  const before=structuredClone(raw);
  const resolved=resolveVocabularyLearningContext(raw,m);
  expect(resolved.curriculum?.basis).toBe('source');
  expect(resolved.sense?.definition).toMatch(/aircraft/);
  expect(resolved.sense?.id).not.toBe(raw.senses[0].id);
  expect(resolved.context?.status).toBe('reviewed');
  expect(raw).toEqual(before);
  const custom=structuredClone(resolved.entry);
  custom.senses[0].definition='My robotics note.';
  const edited=resolveVocabularyLearningContext(custom,m);
  expect(edited.sense?.definition).toBe('My robotics note.');
  expect(edited.reviewed).toBe(false);
  expect(edited.context?.status).not.toBe('reviewed');
  expect(edited.contentReviewed).toBe(false);
  expect(edited.curriculumCurrent).toBe(false);
  const other=resolveVocabularyLearningContext(raw,{...m,senseId:raw.senses[0].id});
  expect(other.curriculumCurrent).toBe(false);
  expect(other.reviewed).toBe(false);
});

test('theme teaching recommendations do not inherit reviewed status from a different old binding', () => {
  const result=resolveVocabularyLearningContext(entry('treat'),{bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-01'});
  if(result.sense?.pos==='noun') {
    expect(result.reviewed).toBe(false);
    expect(result.context?.status).toBe('unreviewed');
  }
});

test('a source recommendation cannot override notes on a different primary identity',()=>{
  const raw=entry('core');
  raw.senses[0].definition='My own core definition.';
  const result=resolveVocabularyLearningContext(raw,{bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02'});
  expect(result.sense?.id).toBe(raw.senses[0].id);
  expect(result.sense?.definition).toBe(raw.senses[0].definition);
  expect(result.curriculumCurrent).toBe(false);
  const explicit=resolveVocabularyLearningContext(raw,{bookId:'ielts-vocabulary',unitId:'ielts-vocabulary-chapter-12-group-02',senseId:'editorial:core:fruit-centre'});
  expect(explicit.sense?.id).toBe('editorial:core:fruit-centre');
});

test.each([['decade',/ten years/],['academic',/education|study/],['office',/work|room/]])('general lists select modern %s meanings without retargeting legacy identities',(term,expected)=>{
  const raw=entry(term);
  const membership=catalog.memberships.find((row:any)=>row.entryId===raw.id&&row.bookId==='ielts-listening-vocabulary');
  const result=resolveVocabularyLearningContext(raw,membership);
  expect(result.sense?.definition).toMatch(expected);
  expect(result.sense?.id).not.toBe(raw.senses[0].id);
  expect(result.entry.senses).toContainEqual(raw.senses[0]);
  expect(result.curriculum?.basis).toBe('common');
  const edited=structuredClone(raw);edited.senses[0].definition='My course-specific meaning.';
  expect(resolveVocabularyLearningContext(edited,membership).sense?.definition).toBe('My course-specific meaning.');
});
