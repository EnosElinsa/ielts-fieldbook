import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { previewLearningMeaningUpdate, updateLearningPlanMeanings } from '../../src/domain/vocabulary/learningMeaningUpdate';
import type { VocabularyLearningBatchSelection } from '../../src/domain/vocabulary/selection';

const original = structuredClone(VOCABULARY_CATALOG);
const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(original)));
function fixture() {
  const entry = structuredClone(released.entries.find((row:any) => row.term === 'escalator'));
  const member = released.memberships.find((row:any) => row.entryId === entry.id && row.bookId === 'ielts-vocabulary');
  const selection: VocabularyLearningBatchSelection = {kind:'learning-batch',bookId:member.bookId,unitId:member.unitId,batchIndex:0,batchSize:10,cards:[{entryId:entry.id,senseId:entry.senses[0].id}]};
  const target = {type:'vocabulary',mode:'learning-batch',assessmentMode:'dictation',...selection};
  const state = {vocabulary:[entry],vocabularySessions:[],plans:[{id:'task',kind:'vocabulary',status:'in_progress',target}]};
  return {entry,selection,state};
}
test('a verified syllabus correction changes the assessment identity without treating different senses as aliases', () => {
  const {selection,state} = fixture();
  const before = structuredClone(state);
  const preview = previewLearningMeaningUpdate(state,selection,'dictation')!;
  expect(preview.batch.selection.cards[0].senseId).toBe('kaikki:e31593c3452df489f1');
  expect(preview.batch.cards[0].entry.senses[0].definition).toBe('A moving staircase that carries people between levels.');
  expect(state).toEqual(before);
  updateLearningPlanMeanings(state,'task',before.plans[0].target,'2026-11-17T12:00:00Z');
  expect(state.plans[0].target.cards).toEqual(preview.batch.selection.cards);
  expect(state.vocabulary).toEqual(before.vocabulary);
  expect(state.vocabularySessions).toEqual(before.vocabularySessions);
});
test('learner edits and unknown or already current meanings never become default corrections', () => {
  const {entry,selection,state} = fixture();
  entry.senses[0].definition = 'My specialised metaphor for an escalating conflict.';
  expect(previewLearningMeaningUpdate(state,selection,'dictation')).toBeUndefined();
  expect(previewLearningMeaningUpdate(fixture().state,{...selection,cards:[{entryId:entry.id,senseId:'missing'}]},'dictation')).toBeUndefined();
  expect(previewLearningMeaningUpdate(fixture().state,{...selection,cards:[{entryId:entry.id,senseId:'kaikki:e31593c3452df489f1'}]},'dictation')).toBeUndefined();
});
test.each(['completed','changed','explicit selection','saved assessment'])('task correction rejects %s without changing any state', scenario => {
  const {state} = fixture();
  const expected = structuredClone(state.plans[0].target);
  if (scenario === 'completed') state.plans[0].status = 'completed';
  if (scenario === 'changed') state.plans[0].target.assessmentMode = 'definition';
  if (scenario === 'explicit selection') Object.assign(state.plans[0].target,{selectedMeanings:expected.cards});
  if (scenario === 'saved assessment') (state.vocabularySessions as any[]).push({id:'saved',planId:'task',status:'submitted'});
  const before = structuredClone(state);
  expect(() => updateLearningPlanMeanings(state,'task',expected,'2026-11-17T12:00:00Z')).toThrow(/changed|saved assessment/);
  expect(state).toEqual(before);
});
