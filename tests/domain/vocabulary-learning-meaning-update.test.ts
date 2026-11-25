import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { previewLearningMeaningUpdate, previewLearningPlanMeaningUpdate, updateLearningPlanMeanings } from '../../src/domain/vocabulary/learningMeaningUpdate';
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

function recordedPreviousSense(term: string) {
  const entry = structuredClone(released.entries.find((row:any) => row.term === term));
  const member = released.memberships.find((row:any) => row.entryId === entry.id && row.bookId === 'ielts-vocabulary');
  const selection: VocabularyLearningBatchSelection = {kind:'learning-batch',bookId:member.bookId,unitId:member.unitId,batchIndex:0,batchSize:10,cards:[{entryId:entry.id,senseId:entry.senses[0].id}]};
  return {entry,selection,state:{vocabulary:[entry],vocabularySessions:[]}};
}
test.each([
  ['official','kaikki:12466cf4fa916b896c','kaikki:3e3792961080473149','Issued or communicated by the appropriate authority.'],
  ['murmur','kaikki:feaaa2971feeb3a205','kaikki:05ca12343db8fed4f4','Soft, indistinct speech.'],
])('a saved %s sense recorded only in previousSenses is corrected to the group meaning with its reason', (term, saved, current, definition) => {
  const {entry,selection,state} = recordedPreviousSense(term);
  expect(entry.senses[0].id).toBe(saved);
  const preview = previewLearningMeaningUpdate(state,selection,'definition')!;
  expect(preview.batch.selection.cards).toEqual([{entryId:entry.id,senseId:current}]);
  expect(preview.changes).toHaveLength(1);
  expect(preview.changes[0]).toMatchObject({entryId:entry.id,term,to:{senseId:current,definition},from:{senseId:saved,definition:entry.senses[0].definition}});
  expect(preview.changes[0].reason).toMatch(/Editorial syllabus recommendation/);
  expect(state.vocabulary[0]).toEqual(entry);
});
test('a learner edit of a previousSenses default stays protected', () => {
  const {entry,selection,state} = recordedPreviousSense('official');
  entry.senses[0].definition = 'My own note about a civil servant.';
  expect(previewLearningMeaningUpdate(state,selection,'definition')).toBeUndefined();
});
test('batch previews report each word old and new meaning', () => {
  const {selection,state} = fixture();
  const preview = previewLearningMeaningUpdate(state,selection,'dictation')!;
  expect(preview.changes.map(row => [row.term,row.from.definition,row.to.definition])).toEqual([['escalator','Anything that escalates.','A moving staircase that carries people between levels.']]);
});
test.each(['planning evidence summary','loaded session'])('a submitted session counted through %s blocks the meaning update', scenario => {
  const {state} = fixture();
  const row = {id:'saved',planId:'task',status:'submitted',mode:'dictation',submittedAt:'2026-11-17T11:00:00Z'};
  if (scenario === 'planning evidence summary') Object.assign(state,{planningEvidence:[{id:'vocabularySessions',rows:[row]}]});
  else (state.vocabularySessions as any[]).push(row);
  const before = structuredClone(state);
  expect(() => updateLearningPlanMeanings(state,'task',state.plans[0].target,'2026-11-17T12:00:00Z')).toThrow(/saved assessment/);
  expect(state).toEqual(before);
  expect(previewLearningPlanMeaningUpdate(state,state.plans[0] as any)).toBeUndefined();
});
test('an unrelated planning evidence summary does not block an unassessed task', () => {
  const {state} = fixture();
  Object.assign(state,{planningEvidence:[{id:'vocabularySessions',rows:[{id:'other',planId:'another-task',status:'submitted'}]}]});
  expect(previewLearningPlanMeaningUpdate(state,state.plans[0] as any)).toBeDefined();
});
