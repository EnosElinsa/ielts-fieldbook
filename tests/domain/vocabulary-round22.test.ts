import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import {getVocabularyLearningPriority,isVocabularyMeaningGroup,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['impact','influence','consequence','outcome'];
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at] as VocabularySense;
const teaching=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[raw(term,at)],hasVocabularySenseEdits);

test.each(terms)('%s retains personal content and any explicitly selected original meaning',term=>{
 const base=entry(term),personal={...base.senses[0],definition:'Our classroom meaning.',example:'Our own classroom example.'};
 expect(supplementVocabularySense(base.id,personal,[base.senses[0]],hasVocabularySenseEdits)).toEqual(personal);
 expect(reviewedEntry({...base,senses:[personal]}).senses[0].definition).toBe(personal.definition);
 expect(resolveVocabularyLearningContext({...base,senses:[raw(term,0)]},{senseId:raw(term,0).id}).sense?.id).toBe(raw(term,0).id);
});

test('impact opens with the general effect sense while physical collisions stay independently selectable',()=>{
 expect(reviewedEntry(entry('impact')).senses[0].id).toBe(raw('impact',3).id);
 expect(teaching('impact',0).definition).toMatch(/collision/);
 expect(teaching('impact',3).distinctionTask?.answer).toBe('a beneficial effect');
 expect(teaching('impact',3).distinctions?.join(' ')).toMatch(/style objection.*not a claim.*obsolete/);
 expect(getVocabularyLearningPriority(entry('impact').id,teaching('impact',3))).toBe('general');
});

test('impact force and energy remain separate quantities rather than interchangeable measurements',()=>{
 const sense=teaching('impact',1);
 expect(sense.distinctions?.join(' ')).toMatch(/force is measured in newtons and energy in joules/);
 expect(sense.distinctionTask?.answer).toMatch(/different physical quantities/);
 expect(teaching('impact',5).distinctionTask?.answer).toBe('compaction');
 expect(teaching('impact',5).distinctions?.join(' ')).toMatch(/does not mean that every particle becomes smaller/);
});

test('impact medical and rare impression records are reading notes with distinct source labels',()=>{
 expect(isVocabularyReadingNote(entry('impact').id,teaching('impact',2))).toBe(true);
 expect(teaching('impact',2).distinctions?.join(' ')).toMatch(/not a diagnosis/);
 expect(teaching('impact',2).usage).toMatch(/checked revision chiefly medicine/);
 expect(isVocabularyReadingNote(entry('impact').id,teaching('impact',7))).toBe(true);
 expect(getVocabularyLearningPriority(entry('impact').id,teaching('impact',7))).toBeUndefined();
 expect(teaching('impact',4).distinctions?.join(' ')).toMatch(/noun stress on the first syllable and verb stress on the second/);
 expect(teaching('impact',6).distinctionTask?.answer).toMatch(/verb taking the affected object directly/);
});

test('influence separates capacity, exertion, a person and uncertain effects without promising full control',()=>{
 expect(teaching('influence',0).distinctionTask?.answer).toMatch(/not complete control/);
 expect(teaching('influence',1).distinctionTask?.answer).toBe('the exertion of influence');
 expect(teaching('influence',2).distinctionTask?.answer).toBe('the teacher who affected the choice');
 expect(teaching('influence',6).distinctionTask?.answer).toBe('leaves the effect on the decision uncertain');
 expect(teaching('influence',6).distinctions?.join(' ')).toMatch(/direct object.*noun phrase/);
});

test('astrological influence explains a recorded belief without claiming scientific verification',()=>{
 const sense=teaching('influence',3);
 expect(isVocabularyReadingNote(entry('influence').id,sense)).toBe(true);
 expect(sense.distinctions?.join(' ')).toMatch(/does not establish.*provide scientific evidence/);
 expect(getVocabularyLearningPriority(entry('influence').id,sense)).toBe('specialist');
});

test('electrostatic influence preserves zero net charge in the specified isolated conductor',()=>{
 const sense=teaching('influence',5);
 expect(sense.distinctions?.join(' ')).toMatch(/without contact.*net charge stays zero/);
 expect(sense.distinctions?.join(' ')).toMatch(/Grounding or contact.*different setup.*not electromagnetic induction/);
 expect(sense.distinctionTask?.answer).toBe('stays zero while charge redistributes');
});

test('intransitive influence and disciplinary consequence are not automatically given historical priority',()=>{
 for(const[term,at]of [['influence',7],['consequence',4]] as const){
  const sense=teaching(term,at);
  expect(isVocabularyReadingNote(entry(term).id,sense)).toBe(true);
  expect(getVocabularyLearningPriority(entry(term).id,sense)).toBeUndefined();
 }
 expect(teaching('consequence',4).distinctions?.join(' ')).toMatch(/does not by itself prove a punishment was carried out/);
});

test('a beneficial consequence remains a lexical meaning while the unwanted submeaning is separately restored',()=>{
 expect(teaching('consequence',0).distinctionTask?.answer).toBe('can name a positive result');
 expect(isVocabularyMeaningGroup(entry('consequence').id,teaching('consequence',0))).toBe(false);
 const restored=sources.filter(row=>row.term==='consequence');
 expect(restored).toHaveLength(1);
 expect(restored[0].parentSenseId).toBe(raw('consequence',0).id);
 expect(restored[0].sourceGloss).toBe('## An unwanted or unpleasant [[effect]].');
 const sense=supplementVocabularySense(entry('consequence').id,restored[0].sense,[restored[0].sense],hasVocabularySenseEdits);
 expect(sense.distinctionTask?.answer).toBe('an unwanted result');
 expect(getVocabularyLearningPriority(entry('consequence').id,sense)).toBe('general');
 expect(resolveVocabularyLearningContext({...entry('consequence'),senses:[sense]},{senseId:sense.id}).sense?.id).toBe(sense.id);
});

test('logical consequence and importance do not get mistaken for physical causation or no effects at all',()=>{
 expect(teaching('consequence',2).distinctions?.join(' ')).toMatch(/whether the premises are true are separate questions/);
 expect(teaching('consequence',2).distinctionTask?.answer).toMatch(/given those premises/);
 expect(teaching('consequence',3).distinctionTask?.answer).toBe('of little importance');
 expect(isVocabularyReadingNote(entry('consequence').id,teaching('consequence',1))).toBe(true);
 expect(getVocabularyLearningPriority(entry('consequence').id,teaching('consequence',1))).toBeUndefined();
});

test('probability outcomes are elements while events may contain several outcomes without automatic equal likelihood',()=>{
 const sense=teaching('outcome',1);
 expect(sense.definition).toMatch(/element of its sample space/);
 expect(sense.distinctions?.join(' ')).toMatch(/event an even number contains the outcomes 2, 4 and 6/);
 expect(sense.distinctions?.join(' ')).toMatch(/does not make them equally likely/);
 expect(sense.distinctionTask?.answer).toMatch(/one outcome/);
});

test('a learning outcome may be intended and needs evidence of achievement',()=>{
 expect(teaching('outcome',2).example).toMatch(/intended outcome/);
 expect(teaching('outcome',2).distinctionTask?.answer).toMatch(/goal whose achievement still needs evidence/);
 expect(teaching('outcome',0).distinctionTask?.answer).toBe('the stated result of the meeting');
 expect(teaching('outcome',3).distinctionTask?.answer).toBe('the completed match result');
});

test('all originals and the one restored child have reviews, with nineteen tasks and exact diagrams',()=>{
 const rows=ledger.records.filter(row=>terms.includes(row.term));
 expect(rows).toHaveLength(27);
 const notes=corrections.filter(row=>rows.some(r=>r.entryId===row.entryId&&r.senseId===row.senseId));
 expect(notes.filter(row=>row.distinctionTask)).toHaveLength(19);
 expect(diagrams.filter(row=>terms.includes(row.term))).toHaveLength(19);
 expect(notes.filter(row=>row.exampleKind==='reading-note')).toHaveLength(8);
 expect(notes.filter(row=>row.learningPriority==='general')).toHaveLength(15);
 expect(notes.filter(row=>row.learningPriority==='specialist')).toHaveLength(6);
 expect(notes.filter(row=>row.learningPriority==='historical')).toHaveLength(2);
 for(const term of terms){
  const senses=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses;
  expect(senses.every((sense:VocabularySense)=>rows.some(row=>row.term===term&&row.senseId===sense.id))).toBe(true);
 }
 for(const row of rows){
  const sense=notes.find(note=>note.entryId===row.entryId&&note.senseId===row.senseId)!;
  expect(row.referenceUrl).toMatch(/oldid=\d+/);
  if(sense.exampleKind==='reading-note'){
   const taught=supplementVocabularySense(row.entryId,sense.originalSense,[sense.originalSense],hasVocabularySenseEdits);
   expect(learningTask(entry(row.term),taught,'cloze')).toBeUndefined();
   expect(taught.distinctionTask).toBeUndefined();
  }
 }
});
