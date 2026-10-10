// @vitest-environment jsdom
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { concealWord, learningTask, reviewedEntry } from './content';
import { createVocabularySession, evaluateVocabularySessionAnswer, buildVocabularySessionCommit } from './session';
import { readVocabularyDraft, writeVocabularyDraft } from '../../storage/vocabularyDrafts';
import { getVocabularyReviewQueue } from './index';
import type { VocabularyEntry, VocabularyStore } from './types';
const entry = (term:string):VocabularyEntry => ({id:`vocab:${term}`,term,meaning:'note',example:'note',category:'word',tags:[],sources:[],senses:[{id:'stable',definition:'note',example:`A ${term} appears.`,pos:'verb',source:'Fieldbook editorial'}],createdAt:'2026-01-01',updatedAt:'2026-01-01'});
const store = (e:VocabularyEntry) => ({vocabulary:[e],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[]} as VocabularyStore);
describe('reviewed learning content',()=>{
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
