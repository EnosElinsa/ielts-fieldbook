import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {isVocabularyMeaningGroup,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
// Fixed counts describe the original batch; later scope variants have separate source and route checks.
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['approach','benefit','available','claim'];
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at] as VocabularySense;
const teaching=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[raw(term,at)],hasVocabularySenseEdits);

test.each(terms)('%s retains a learner’s independent example after public teaching arrives',term=>{
 const base=entry(term),personal={...base.senses[0],example:'An independent example from our own classroom.'};
 expect(supplementVocabularySense(base.id,personal,[base.senses[0]],hasVocabularySenseEdits)).toEqual(personal);
});

test('initial meanings prioritise a method, an advantage, usable resources and an assertion',()=>{
 expect(reviewedEntry(entry('approach')).senses[0].definition).toMatch(/method or way/);
 expect(reviewedEntry(entry('benefit')).senses[0].definition).toMatch(/advantage/);
 expect(reviewedEntry(entry('available')).senses[0].definition).toMatch(/Ready or able to be used/);
 expect(reviewedEntry(entry('claim')).senses[0].definition).toMatch(/statement presented as true/);
});

test('approaching infinity uses eventual unboundedness rather than distance from a finite destination',()=>{
 const sense=teaching('approach',6);
 expect(sense.definition).toMatch(/finite value.*positive or negative infinity/);
 expect(sense.distinctions?.join(' ')).toMatch(/eventually exceeding every fixed bound/);
 expect(sense.distinctions?.join(' ')).toMatch(/limit need not be attained/);
 expect(sense.distinctionTask?.answer).toBe('eventually exceeds every fixed bound');
 expect(learningTask(entry('approach'),sense,'cloze')?.acceptedAnswers).toContain('approach');
});

test('approach restores access to a crag and an airport procedure under their independent lexical parents',()=>{
 const rows=sources.filter(row=>row.term==='approach');expect(rows).toHaveLength(2);
 const taught=rows.map(row=>supplementVocabularySense(row.entryId,row.sense as VocabularySense,[row.sense as VocabularySense],hasVocabularySenseEdits));
 expect(taught.some(s=>/path.*climbing area/.test(s.definition))).toBe(true);
 expect(taught.some(s=>/procedure.*aircraft/.test(s.definition))).toBe(true);
 expect(taught.find(s=>/path.*climbing area/.test(s.definition))?.distinctions?.join(' ')).toMatch(/separate from the climbing route/);
 expect(taught.find(s=>/procedure.*aircraft/.test(s.definition))?.distinctions?.join(' ')).toMatch(/discontinued/);
 expect(isVocabularyMeaningGroup(entry('approach').id,teaching('approach',13))).toBe(false);
 expect(isVocabularyMeaningGroup(entry('approach').id,teaching('approach',16))).toBe(false);
});

test('benefit grammar keeps the recipient in the object or before benefit from',()=>{
 const gives=teaching('benefit',5),receives=teaching('benefit',6);
 expect(gives.example).toBe('The new timetable will benefit commuters.');
 expect(receives.example).toBe('Commuters will benefit from the new timetable.');
 expect(gives.distinctionTask?.answer).toBe('Commuters');
 expect(receives.distinctionTask?.answer).toBe('the source of the advantage');
 expect(learningTask(entry('benefit'),gives,'cloze')?.acceptedAnswers).toContain('benefit');
 expect(learningTask(entry('benefit'),receives,'cloze')?.acceptedAnswers).toContain('benefit');
});

test('benefit separates a payment, an event and an intended audience',()=>{
 expect(teaching('benefit',1).definition).toMatch(/payment.*insurance.*public assistance/);
 expect(teaching('benefit',2).definition).toMatch(/event.*raise money/);
 expect(teaching('benefit',4).definition).toMatch(/person or audience/);
 expect(teaching('benefit',4).distinctionTask?.answer).toBe('the intended audience');
});

test('available distinguishes usable, obtainable and free to speak while retaining specialised reading meanings',()=>{
 expect(teaching('available',0).distinctions?.join(' ')).toMatch(/does not by itself say.*free of charge/);
 expect(teaching('available',1).definition).toMatch(/obtained or bought/);
 expect(teaching('available',4).example).toBe('Are you available for a meeting at three?');
 expect(teaching('available',4).distinctions?.join(' ')).toMatch(/relationship interpretation depends on context/);
 expect(teaching('available',2).definition).toMatch(/legal use, valid/);
 expect(teaching('available',3).definition).toMatch(/archaic.*effective/);
 expect(isVocabularyReadingNote(entry('available').id,teaching('available',2))).toBe(true);
 expect(isVocabularyReadingNote(entry('available').id,teaching('available',3))).toBe(true);
});

test('claim does not inherently imply falsity, a new invention, established ownership or awarded compensation',()=>{
 expect(teaching('claim',3).distinctions?.join(' ')).toMatch(/true or false.*strong, weak or no evidence/);
 expect(teaching('claim',3).distinctions?.join(' ')).toMatch(/need not be newly invented/);
 expect(teaching('claim',7).distinctions?.join(' ')).toMatch(/does not automatically mean.*false/);
 expect(teaching('claim',0).distinctionTask?.answer).toBe('an assertion of ownership or entitlement');
 expect(teaching('claim',5).distinctions?.join(' ')).toMatch(/rather than a confirmed award/);
 expect(teaching('claim',9).distinctionTask?.answer).toBe('seek compensation');
});

test('claim keeps causing a loss separate from winning and from land assertions',()=>{
 expect(teaching('claim',11).distinctionTask?.answer).toBe('caused the deaths');
 expect(teaching('claim',12).distinctionTask?.answer).toBe('secured the prize');
 expect(teaching('claim',4).distinctions?.join(' ')).toMatch(/does not establish.*unoccupied/);
 expect(teaching('claim',12).distinctions?.join(' ')).toMatch(/context determines.*actual win/);
});

test('all new reading explanations stay out of sentence gaps and lose that classification after a personal edit',()=>{
 const rows=corrections.filter(row=>!('contentVariant' in row)&&terms.some(term=>entry(term).id===row.entryId)&&row.exampleKind==='reading-note');expect(rows).toHaveLength(17);
 for(const row of rows){
  const source=row.originalSense as VocabularySense,sense=supplementVocabularySense(row.entryId,source,[source],hasVocabularySenseEdits);
  const base=entry(terms.find(term=>entry(term).id===row.entryId)!);
  expect(learningTask(base,sense,'cloze')).toBeUndefined();
  expect(isVocabularyReadingNote(base.id,{...sense,example:'An independent classroom example.'})).toBe(false);
 }
});
