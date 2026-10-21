// @vitest-environment jsdom
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { concealWord, learningTask, reviewedEntry } from './content';
import { createVocabularySession, evaluateVocabularySessionAnswer, buildVocabularySessionCommit } from './session';
import { readVocabularyDraft, writeVocabularyDraft } from '../../storage/vocabularyDrafts';
import { getVocabularyReviewQueue } from './index';
import { resolveVocabularyLearningContext } from './context';
import { VOCABULARY_CATALOG } from './catalog';
import type { VocabularyEntry, VocabularyStore } from './types';
const entry = (term:string):VocabularyEntry => ({id:`vocab:${term}`,term,meaning:'note',example:'note',category:'word',tags:[],sources:[],senses:[{id:'stable',definition:'note',example:`A ${term} appears.`,pos:'verb',source:'Fieldbook editorial'}],createdAt:'2026-01-01',updatedAt:'2026-01-01'});
const store = (e:VocabularyEntry) => ({vocabulary:[e],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[]} as VocabularyStore);
describe('reviewed learning content',()=>{
 describe('dictionary task precedence',()=>{
 const catalog=JSON.parse(fs.readFileSync('public/vocabulary-catalog.json','utf8'));
 const original=structuredClone(VOCABULARY_CATALOG);
 const releasedEntry = (term: string): VocabularyEntry => {
  const e=structuredClone(catalog.entries.find((row: VocabularyEntry) => row.term === term));
  const index=JSON.parse(fs.readFileSync('public/dictionary/index.json','utf8'));
  if(index[term]) e.senses=JSON.parse(fs.readFileSync(`public/dictionary/${index[term]}`,'utf8')).senses;
  return e;
 };
 beforeEach(()=>Object.assign(VOCABULARY_CATALOG,structuredClone(catalog)));
 afterEach(()=>Object.assign(VOCABULARY_CATALOG,structuredClone(original)));
 test('a fully reviewed meaning uses its current example in a new cloze task',()=>{
  const e=reviewedEntry(releasedEntry('permit')); const sense=e.senses[0];
  expect(sense.example).toBe('The rules permit parking in marked bays.');
  const task=learningTask(e,sense,'cloze')!;
  expect(task.prompt).toBe('The rules _____ parking in marked bays.');
  expect(task.acceptedAnswers).toEqual(['permit']);
 });
 test('omitting optional metadata from a saved public snapshot does not restore an obsolete task',()=>{
  const e=reviewedEntry(releasedEntry('permit')); const current=e.senses[0];
  const saved={id:current.id,definition:current.definition,example:current.example,pos:current.pos,source:current.source};
  expect(learningTask({...e,senses:[saved]},saved,'cloze')?.prompt).toBe('The rules _____ parking in marked bays.');
  expect(learningTask({...e,senses:[saved]},saved,'synonym')).toBeUndefined();
 });
 test('a dictionary review cannot inherit a term-level definition or synonym task from an older context',()=>{
  const e=reviewedEntry(releasedEntry('permit')); const sense=e.senses[0];
  expect(learningTask(e,sense,'definition')).toBeUndefined();
  expect(learningTask(e,sense,'synonym')).toBeUndefined();
  expect(learningTask(e,sense,'distinction')?.prompt).toBe(sense.distinctionTask!.prompt);
 });
 test('a reviewed source sentence does not inherit irregular-form or synonym tasks from a different common context',()=>{
  const result=resolveVocabularyLearningContext(releasedEntry('begin'));
  expect(result.sense!.id).toBe('kaikki:31da449bf40eb36e43');
  expect(result.sense!.example).toBe('I began playing the piano at the age of five.');
  expect(learningTask(result.entry,result.sense!,'cloze')).toBeUndefined();
  expect(learningTask(result.entry,result.sense!,'synonym')).toBeUndefined();
  expect(getVocabularyReviewQueue(store(result.entry),{mode:'definition',senseId:result.sense!.id,dueOnly:false})).toHaveLength(1);
 });
 test('personal examples and other permit meanings cannot receive the common-context task',()=>{
  const e=reviewedEntry(releasedEntry('permit')); const sense=e.senses[0];
  const personal={...sense,example:'My permit reminder is here.',source:'Personal note'};
  expect(learningTask({...e,senses:[personal]},personal,'cloze')?.prompt).toBe('My _____ reminder is here.');
  expect(learningTask({...e,senses:[personal]},personal,'synonym')).toBeUndefined();
  const document=e.senses.find(row=>row.pos==='noun')!;
  expect(learningTask({...e,senses:[document,...e.senses.filter(row=>row.id!==document.id)]},document,'synonym')).toBeUndefined();
 });
 test('a started permit session retains its old task and score after the public review',()=>{
  const raw=releasedEntry('permit'); const e=reviewedEntry(raw); const state=store(e);
  const cards=getVocabularyReviewQueue(state,{mode:'cloze',dueOnly:false});
  cards[0].task=learningTask(raw,raw.senses[0],'cloze');
  expect(cards[0].task?.prompt).toBe('The rules _____ visitors to take photographs.');
  const session=createVocabularySession(cards,'cloze',{});
  session.answers[cards[0].id]={response:'permit',answeredAt:'2026-10-18',durationMs:1};
  cards[0].task={...learningTask(e,e.senses[0],'cloze')!,acceptedAnswers:['parking']};
  expect(session.cardSnapshots![0].task?.prompt).toBe('The rules _____ visitors to take photographs.');
  expect(buildVocabularySessionCommit(state,session,cards).results[0].result).toBe('success');
 });
 });
 test('cloze uses boundaries and explicit irregular form',()=>{
  expect(concealWord('A disorder and order.', 'order')).toBe('A disorder and _____.');
  const e=entry('begin');const task=learningTask(e,e.senses[0],'cloze')!;
  expect(task.prompt).toBe('The conference _____ on Monday.'); expect(task.acceptedAnswers).toEqual(['began']);
 });
 test('same-sense synonyms reject self and wrong-sense answer',()=>{
  const e=entry('order');const cards=getVocabularyReviewQueue(store(e),{mode:'synonym',dueOnly:false});
  expect(evaluateVocabularySessionAnswer(cards[0],'society').result).toBe('failure');
  expect(evaluateVocabularySessionAnswer(cards[0],'sequence').result).toBe('success');
  expect(evaluateVocabularySessionAnswer(cards[0],'order').result).toBe('failure');
 });
 test.each([
  ['begin','began','started','start'],
  ['reduce','reduced','lowered','lower'],
  ['improve','improves','enhances','enhance'],
 ])('synonym preserves the grammatical form for %s', (term,target,accepted,rejected)=>{
  const e=entry(term);const card=getVocabularyReviewQueue(store(e),{mode:'synonym',dueOnly:false})[0];
  expect(card.task?.prompt).toContain(`Replace “${target}”`);
  expect(evaluateVocabularySessionAnswer(card,accepted).result).toBe('success');
  expect(evaluateVocabularySessionAnswer(card,rejected).result).toBe('failure');
 });
 test('freezes task and score after the current content changes',()=>{
  const e=entry('begin');const state=store(e);const cards=getVocabularyReviewQueue(state,{mode:'cloze',dueOnly:false});
  const session=createVocabularySession(cards,'cloze',{}); session.answers[cards[0].id]={response:'began',answeredAt:'2026-10-10',durationMs:1};
  cards[0].task!.acceptedAnswers=['begin'];
  expect(buildVocabularySessionCommit(state,session,cards).results[0].result).toBe('success');
  expect(session.cardSnapshots![0].task!.acceptedAnswers).toEqual(['began']);
 });
 test('common priority senses preserve original notes and IDs',()=>{
  const e=entry('recipe'); const corrected=reviewedEntry(e);
  expect(corrected.senses.some(s=>s.id==='stable'&&s.definition==='note')).toBe(true);
  expect(corrected.senses[0].definition).toMatch(/food|dish|cook/i);expect(e.meaning).toBe('note');
 });
 test('validated drafts restore frozen content and reject altered task shapes',()=>{
  localStorage.clear(); const e=entry('begin'); const cards=getVocabularyReviewQueue(store(e),{mode:'cloze',dueOnly:false});
  const session=createVocabularySession(cards,'cloze',{});
  expect(writeVocabularyDraft('alice',session)).toBe(true);
  expect(readVocabularyDraft('alice')?.cardSnapshots?.[0].task?.acceptedAnswers).toEqual(['began']);
  const invalid=structuredClone(session);invalid.cardSnapshots![0].task!.acceptedAnswers=[];
  expect(writeVocabularyDraft('alice',invalid)).toBe(false);expect(readVocabularyDraft('bob')).toBeNull();
  const legacy={...session};delete legacy.cardSnapshots;delete legacy.contentVersion;
  expect(writeVocabularyDraft('alice',legacy)).toBe(true);expect(readVocabularyDraft('alice')?.cardSnapshots).toBeUndefined();
 });
 test('legacy distinction scorer remains compatible',()=>{
  const e=entry('word');e.senses[0].synonyms=['expression'];
  expect(evaluateVocabularySessionAnswer({id:'card',entryId:e.id,senseId:'stable',mode:'distinction',entry:e,sources:[],dimension:'meaning',dueAt:e.createdAt},'expression').result).toBe('success');
 });
});

test('full corpus task integrity and per-book coverage audit',()=>{
 const catalog=JSON.parse(fs.readFileSync('public/vocabulary-catalog.json','utf8'));
 const index=JSON.parse(fs.readFileSync('public/dictionary/index.json','utf8'));
 let dictionarySenses=0; for(const filename of Object.values(index)) dictionarySenses += JSON.parse(fs.readFileSync(`public/dictionary/${filename}`,'utf8')).senses.length;
 const counts=new Map<string,Record<string,number>>(); const replacements:string[]=[];
 for(const raw of catalog.entries as VocabularyEntry[]){
  const e=reviewedEntry(raw);if(e.senses[0].id!==raw.senses[0].id)replacements.push(e.id);
  const coverage:Record<string,number>={definition:Number(Boolean(learningTask(e,e.senses[0],'definition')||e.senses[0]?.definition)),cloze:0,synonym:0,distinction:0};
  for(const mode of ['cloze','synonym','distinction']){
   const task=learningTask(e,e.senses[0],mode); if(!task)continue; coverage[mode]=1;
   expect(task.acceptedAnswers.length).toBeGreaterThan(0);expect(task.explanation.trim()).not.toBe('');
   expect(task.acceptedAnswers.every(answer=>answer.trim()&& !/[\u3400-\u9fff]/u.test(answer))).toBe(true);
   if(mode==='cloze') expect(task.prompt).toContain('_____');
   if(mode==='synonym') expect(task.acceptedAnswers.map(a=>a.toLowerCase())).not.toContain(e.term.toLowerCase());
  }
  counts.set(e.id,coverage);
 }
 const byBook=catalog.books.map((book:{id:string,title:string})=>{
  const ids=[...new Set<string>(catalog.memberships.filter((m:{bookId:string})=>m.bookId===book.id).map((m:{entryId:string})=>m.entryId))];
  return {id:book.id,title:book.title,total:ids.length,...Object.fromEntries(['definition','cloze','synonym','distinction'].map(mode=>[mode,ids.reduce((sum,id)=>sum+(counts.get(id)?.[mode]||0),0)]))};
 });
 expect(replacements.length).toBeGreaterThan(100);
 for (const book of byBook) {
  expect(book.synonym).toBeGreaterThan(0);
  for (const mode of ['definition','cloze','synonym','distinction']) expect(book[mode]).toBeLessThanOrEqual(book.total);
 }
 expect(catalog.entries).toHaveLength(7021);expect(dictionarySenses).toBeGreaterThan(51000);expect(byBook).toHaveLength(6);
}, 20000);
