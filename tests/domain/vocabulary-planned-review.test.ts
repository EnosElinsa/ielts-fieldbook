import { emptyState, mergeBackup, validateBackup, completeVocabularyPlan } from '../../src/domain';
import { expect, test } from 'vitest';
import { isVocabularySessionSelection } from '../../src/domain/vocabulary/selection';
import { createVocabularySession, buildVocabularySessionCommit } from '../../src/domain/vocabulary/session';
import { readVocabularyDraft, writeVocabularyDraft } from '../../src/storage/vocabularyDrafts';

function fixture() {
  const entry = { id:'word',term:'record',category:'word' as const,tags:[],sources:[],meaning:'Meaning',example:'Example',createdAt:'2020-01-01',updatedAt:'2020-01-01',senses:Array.from({length:60},(_,i)=>({id:`sense-${i}`,definition:`Meaning ${i}`,example:'Example'})) };
  const cards=entry.senses.map(sense=>({id:`word:${sense.id}:dictation`,entryId:entry.id,senseId:sense.id,entry,mode:'dictation' as const,dimension:'spelling' as const,dueAt:'2020-01-01',sources:[]}));
  const selection={kind:'planned-review' as const,planId:'plan',cards:cards.map(({entryId,senseId})=>({entryId,senseId})).reverse()};
  const state={vocabulary:[entry],vocabularyStates:[],vocabularyReviews:[],vocabularyEvidence:[],vocabularyActivities:[],vocabularySessions:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[]};
  return {cards,selection,state};
}
test('planned reviews preserve 60 exact senses and frozen order through draft and commit',()=>{
  const {cards,selection,state}=fixture();
  expect(isVocabularySessionSelection(selection)).toBe(true);
  const session=createVocabularySession(cards,'dictation',{sessionSize:5,order:'random'}, {}, selection as any);
  expect(session.cardIds.map(({entryId,senseId})=>({entryId,senseId}))).toEqual(selection.cards);
  expect(session.planId).toBe('plan');
  expect(writeVocabularyDraft('planned-owner',session)).toBe(true);
  expect(readVocabularyDraft('planned-owner')?.selection).toEqual(selection);
  expect(buildVocabularySessionCommit(state,session,cards).sessionRecord.selection).toEqual(selection);
});
test('planned reviews reject duplicate pairs and mismatched draft or submitted cards',()=>{
  const {cards,selection,state}=fixture();
  expect(isVocabularySessionSelection({...selection,cards:[selection.cards[0],selection.cards[0]]})).toBe(false);
  const session=createVocabularySession(cards,'dictation',{}, {}, selection as any);
  const changed={...session,cardIds:session.cardIds.slice(1)};
  expect(writeVocabularyDraft('planned-owner',changed)).toBe(false);
  expect(()=>buildVocabularySessionCommit(state,changed,cards)).toThrow(/planned|selection/i);
  expect(()=>buildVocabularySessionCommit(state,{...session,planId:'other'},cards)).toThrow(/planned|selection/i);
});

test('backup import and history retain all exact legacy planned senses',()=>{
  const {cards,selection,state}=fixture();
  const session=createVocabularySession(cards,'dictation',{sessionSize:5}, {}, selection as any);
  const committed=buildVocabularySessionCommit(state,session,cards).state;
  const backup={...emptyState(),...committed};
  expect(validateBackup(backup).valid).toBe(true);
  const restored=mergeBackup(emptyState(),backup);
  expect(restored.vocabularySessions[0].selection).toEqual(selection);
  expect(restored.vocabularySessions[0].results.map(({entryId,senseId}:any)=>({entryId,senseId}))).toEqual(selection.cards);
  expect(restored.vocabularySessions[0].cardSnapshots).toHaveLength(60);
});

test('planned completion distinguishes exact entry and sense pairs even with colon identifiers',()=>{
  const plan={id:'plan',kind:'vocabulary',status:'in_progress',startedAt:'2020-01-01',target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:'a:b',senseId:'c'}]}};
  const session={id:'session',planId:'plan',mode:'definition',status:'submitted',startedAt:'2020-01-02',submittedAt:'2020-01-03',results:[{entryId:'a',senseId:'b:c',response:'word',result:'success'}]};
  const state={plans:[plan],activePlanId:'plan'};
  expect(completeVocabularyPlan(state,session)).toBeNull();
  expect(plan.status).toBe('in_progress');
});
