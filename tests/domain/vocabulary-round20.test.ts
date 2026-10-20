import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import {getVocabularyLearningPriority,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
// Fixed counts describe the original batch; later scope variants have separate source and route checks.
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['assure','insure','assume','presume'];
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at] as VocabularySense;
const teaching=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[raw(term,at)],hasVocabularySenseEdits);

test.each(terms)('%s preserves personal content and an explicitly selected original sense',term=>{
 const base=entry(term),personal={...base.senses[0],definition:'Our classroom meaning.',example:'Our own classroom example.'};
 expect(supplementVocabularySense(base.id,personal,[base.senses[0]],hasVocabularySenseEdits)).toEqual(personal);
 const reviewed=reviewedEntry({...base,senses:[personal]});
 expect(reviewed.senses[0].definition).toBe(personal.definition);
 const source=raw(term,0),selected=resolveVocabularyLearningContext({...base,senses:[source]},{senseId:source.id});
 expect(selected.sense?.id).toBe(source.id);
});

test('assure starts with addressing a person and presume starts with supposition without removing other senses',()=>{
 expect(reviewedEntry(entry('assure')).senses[0].id).toBe(raw('assure',1).id);
 expect(reviewedEntry(entry('presume')).senses[0].id).toBe(raw('presume',2).id);
 expect(reviewedEntry(entry('assure')).senses.some(s=>s.id===raw('assure',0).id)).toBe(true);
 expect(reviewedEntry(entry('presume')).senses.some(s=>s.id===raw('presume',0).id)).toBe(true);
});

test('assurance addresses a person but does not independently prove the statement',()=>{
 const sense=teaching('assure',1);
 expect(sense.definition).toMatch(/tell someone confidently/);
 expect(sense.distinctions?.join(' ')).toMatch(/not independent proof/);
 expect(sense.collocations).toContain('assure someone that');
 expect(sense.collocations).toContain('assure someone of something');
 expect(teaching('assure',0).distinctions?.join(' ')).toMatch(/overlaps with ensure/);
 expect(teaching('assure',3).distinctions?.join(' ')).toMatch(/reducing someone’s worry/);
});

test('insurance protects under policy terms rather than preventing an event or guaranteeing every loss',()=>{
 const sense=teaching('insure',0);
 expect(sense.definition).toMatch(/financial protection.*specified risk.*policy/);
 expect(sense.distinctions?.join(' ')).toMatch(/Both a policyholder and an insurer/);
 expect(sense.distinctions?.join(' ')).toMatch(/does not prevent the event or promise compensation for every loss/);
 expect(sense.distinctionTask?.answer).toBe('arrange financial protection under the policy');
 expect(teaching('insure',1).distinctionTask?.answer).toBe('the insurance provider');
});

test('the recorded insure-as-ensure meaning remains readable rather than being declared an impossible use',()=>{
 const sense=teaching('insure',2);
 expect(sense.example).toMatch(/US Constitution.*insure domestic Tranquility/);
 expect(sense.distinctions?.join(' ')).toMatch(/do not claim every occurrence of insure must describe a policy/);
 expect(isVocabularyReadingNote(entry('insure').id,sense)).toBe(true);
 expect(learningTask(entry('insure'),sense,'cloze')).toBeUndefined();
});

test('assuming a proposition does not authenticate a fact and no rigid evidence rule divides assume from presume',()=>{
 expect(teaching('assume',0).definition).toMatch(/without establishing it by proof/);
 expect(teaching('assume',0).definition).not.toMatch(/authenticate/);
 expect(teaching('assume',0).distinctions?.join(' ')).toMatch(/does not authenticate a fact or verify evidence/);
 expect(teaching('assume',0).distinctions?.join(' ')).toMatch(/overlap.*rigid rule/);
 expect(teaching('presume',2).distinctions?.join(' ')).toMatch(/not conclusive proof/);
 expect(teaching('presume',2).distinctions?.join(' ')).toMatch(/do not impose a universal evidence threshold/);
});

test('taking a role and putting on a manner remain separate from believing a proposition',()=>{
 expect(teaching('assume',1).distinctionTask?.answer).toBe('take the responsibility on');
 expect(teaching('assume',1).distinctions?.join(' ')).toMatch(/does not by itself imply deception/);
 expect(teaching('assume',2).distinctions?.join(' ')).toMatch(/outward indifference need not match/);
 expect(teaching('assume',2).distinctions?.join(' ')).toMatch(/legitimately taking on a responsibility/);
});

test('the source admission and adopt meanings do not invent child-adoption or proof claims',()=>{
 expect(teaching('assume',3).distinctions?.join(' ')).toMatch(/does not by itself describe the modern legal adoption of a child/);
 expect(teaching('assume',4).distinctions?.join(' ')).toMatch(/source gives no usage example/);
 for(const at of [3,4]){
  const sense=teaching('assume',at);
  expect(isVocabularyReadingNote(entry('assume').id,sense)).toBe(true);
  expect(getVocabularyLearningPriority(entry('assume').id,sense)).toBeUndefined();
 }
});

test('a negative presume-to construction declines the liberty instead of asserting that it happened',()=>{
 expect(teaching('presume',0).distinctionTask?.answer).toBe('declines to take an unwarranted liberty');
 expect(teaching('presume',0).distinctions?.join(' ')).toMatch(/does not say the speaker actually gave the orders/);
 expect(teaching('presume',1).usage).toMatch(/Preserved source: archaic; checked revision: rare/);
});

test('an accepted premise remains conditional and kindness does not grant an unlimited entitlement',()=>{
 expect(getVocabularyLearningPriority(entry('presume').id,teaching('presume',3))).toBe('general');
 expect(teaching('presume',3).distinctionTask?.answer).toBe('conditional on the accepted premise');
 expect(teaching('presume',3).distinctions?.join(' ')).toMatch(/does not establish it as an observed fact/);
 expect(teaching('presume',4).distinctions?.join(' ')).toMatch(/does not create an unlimited obligation/);
});

test('all 17 original meanings have source-bound reviews, twelve tasks and eleven exact diagram bindings',()=>{
 const rows=ledger.records.filter(row=>terms.includes(row.term));
 expect(rows).toHaveLength(17);
 const notes=corrections.filter(row=>!('contentVariant' in row)&&rows.some(r=>r.entryId===row.entryId&&r.senseId===row.senseId));
 expect(notes.filter(row=>row.distinctionTask)).toHaveLength(12);
 expect(diagrams.filter(row=>terms.includes(row.term))).toHaveLength(11);
 expect(notes.filter(row=>row.exampleKind==='reading-note')).toHaveLength(5);
 for(const row of notes.filter(row=>row.exampleKind==='reading-note')){
  const sense=teaching(terms.find(term=>entry(term).id===row.entryId)!,JSON.parse(readFileSync('public/dictionary/'+index[terms.find(term=>entry(term).id===row.entryId)!],'utf8')).senses.findIndex((sense:VocabularySense)=>sense.id===row.senseId));
  expect(learningTask(entry(terms.find(term=>entry(term).id===row.entryId)!),sense,'cloze')).toBeUndefined();
  expect(isVocabularyReadingNote(row.entryId,{...sense,example:'My independent classroom sentence.'})).toBe(false);
 }
});
