import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['effective','efficient','sensible','sensitive'];
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at] as VocabularySense;
const teaching=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[raw(term,at)],hasVocabularySenseEdits);

test.each(terms)('%s preserves an independently edited personal example',term=>{
 const base=entry(term),personal={...base.senses[0],example:'An independent example from our own classroom.'};
 expect(supplementVocabularySense(base.id,personal,[base.senses[0]],hasVocabularySenseEdits)).toEqual(personal);
});

test('initial meanings favour intended results, resource use, judgement and emotional sensitivity',()=>{
 expect(reviewedEntry(entry('effective')).senses[0].definition).toMatch(/intended result/);
 expect(reviewedEntry(entry('efficient')).senses[0].definition).toMatch(/resources with little waste/);
 expect(reviewedEntry(entry('sensible')).senses[0].definition).toMatch(/good judgement/);
 expect(reviewedEntry(entry('sensitive')).senses[0].id).toBe(raw('sensitive',2).id);
});

test('effective and efficient assess different things even when a method achieves its goal',()=>{
 const result=teaching('effective',0),resources=teaching('efficient',0);
 expect(result.distinctions?.join(' ')).toMatch(/work while using a great deal of time or energy/);
 expect(resources.distinctions?.join(' ')).toMatch(/two judgements need not coincide/);
 expect(result.distinctionTask?.answer).toBe('achieves the intended result');
 expect(resources.distinctionTask?.answer).toBe('resource use for the work done');
 expect(learningTask(entry('effective'),result,'cloze')?.acceptedAnswers).toContain('effective');
 expect(learningTask(entry('efficient'),resources,'cloze')?.acceptedAnswers).toContain('efficient');
});

test('effective from gives a starting date rather than a claim that every policy goal is achieved',()=>{
 const sense=teaching('effective',3);
 expect(sense.definition).toMatch(/In force or applying/);
 expect(sense.distinctionTask?.answer).toBe('starts to apply');
 expect(sense.distinctions?.join(' ')).toMatch(/does not claim.*achieved/);
});

test('effective strength counts personnel actually available instead of the nominal roster',()=>{
 const sense=teaching('effective',2);
 expect(sense.definition).toMatch(/actually usable|Actually usable/);
 expect(sense.distinctionTask?.answer).toBe('fifty soldiers');
 expect(sense.distinctions?.join(' ')).toMatch(/actually available.*nominal total/);
});

test('effective mathematical meanings allow zero coefficients and exclude only nonidentity trivial actions',()=>{
 const divisor=teaching('effective',4),action=teaching('effective',5);
 expect(divisor.definition).toMatch(/nonnegative coefficients/);
 expect(divisor.distinctions?.join(' ')).toMatch(/includes zero/);
 expect(action.definition).toMatch(/only the identity element.*every point/);
 expect(action.distinctions?.join(' ')).toMatch(/identity always fixes every point/);
 expect(action.distinctions?.join(' ')).toMatch(/fix some points.*not fix all/);
 expect(action.distinctions?.join(' ')).toMatch(/free action is a stronger condition/);
 expect(learningTask(entry('effective'),action,'cloze')).toBeUndefined();
});

test('an effective theory has a stated regime instead of claiming a complete fundamental description',()=>{
 const sense=teaching('effective',6);
 expect(sense.definition).toMatch(/specified regime.*without representing every underlying process/);
 expect(sense.distinctions?.join(' ')).toMatch(/does not mean necessarily useless or inaccurate/);
 expect(isVocabularyReadingNote(entry('effective').id,sense)).toBe(true);
});

test('efficient energy use compares useful output with input and does not destroy the remaining energy',()=>{
 const sense=teaching('efficient',1);
 expect(sense.distinctionTask?.answer).toBe('20 percent');
 expect(sense.distinctions?.join(' ')).toMatch(/100 joules.*20 joules.*20 percent/);
 expect(sense.distinctions?.join(' ')).toMatch(/remaining energy.*other forms.*does not disappear/);
});

test('efficient cause and the obsolete noun remain reading uses independent of resource economy',()=>{
 expect(teaching('efficient',2).distinctions?.join(' ')).toMatch(/separate from the modern resource-use meaning/);
 expect(teaching('efficient',4).definition).toMatch(/obsolete.*cause/);
 for(const at of [2,3,4])expect(learningTask(entry('efficient'),teaching('efficient',at),'cloze')).toBeUndefined();
});

test('sensible distinguishes judgement, practical clothing and perceptibility',()=>{
 expect(teaching('sensible',0).distinctionTask?.answer).toBe('good judgement');
 expect(teaching('sensible',1).distinctionTask?.answer).toBe('practicality and comfort');
 expect(teaching('sensible',1).distinctions?.join(' ')).toMatch(/does not require.*unattractive/);
 expect(teaching('sensible',2).distinctionTask?.answer).toBe('perceived through the senses');
 expect(teaching('sensible',8).definition).toMatch(/obsolete.*perceptible/);
});

test('sensitive separates personal vulnerability, consideration, upsetting topics and confidentiality',()=>{
 expect(teaching('sensitive',2).distinctionTask?.answer).toBe('readily hurt by critical remarks');
 expect(teaching('sensitive',5).distinctionTask?.answer).toBe('considerate');
 expect(teaching('sensitive',3).distinctions?.join(' ')).toMatch(/does not mean.*every discussion is forbidden/);
 expect(teaching('sensitive',4).distinctionTask?.answer).toBe('confidentiality');
 expect(teaching('sensitive',6).definition).toMatch(/careful or tactful handling/);
});

test('instrument sensitivity describes responsiveness without guaranteeing measurement accuracy',()=>{
 const sense=teaching('sensitive',7);
 expect(sense.definition).toMatch(/small changes/);
 expect(sense.distinctions?.join(' ')).toMatch(/sensitivity does not by itself guarantee accuracy/);
 expect(sense.distinctions?.join(' ')).toMatch(/change in indication.*change in the measured quantity/);
 expect(sense.distinctionTask?.answer).toBe('responsiveness, without by itself proving accuracy');
});

test('sensitive paranormal senses record claims without validating paranormal abilities',()=>{
 expect(teaching('sensitive',8).definition).toMatch(/said to have/);
 expect(teaching('sensitive',9).definition).toMatch(/said to have.*paranormal/);
 for(const at of [8,9]){
  const sense=teaching('sensitive',at);
  expect(sense.distinctions?.join(' ')).toMatch(/does not (establish|verify)/);
  expect(isVocabularyReadingNote(entry('sensitive').id,sense)).toBe(true);
  expect(learningTask(entry('sensitive'),sense,'cloze')).toBeUndefined();
 }
});

test('every new reading explanation stays out of sentence gaps while a personal replacement stays independent',()=>{
 const rows=corrections.filter(row=>terms.some(term=>entry(term).id===row.entryId)&&row.exampleKind==='reading-note');expect(rows).toHaveLength(17);
 for(const row of rows){
  const source=row.originalSense as VocabularySense,sense=supplementVocabularySense(row.entryId,source,[source],hasVocabularySenseEdits);
  const base=entry(terms.find(term=>entry(term).id===row.entryId)!);
  expect(learningTask(base,sense,'cloze')).toBeUndefined();
  expect(isVocabularyReadingNote(base.id,{...sense,example:'An independent classroom example.'})).toBe(false);
 }
});
